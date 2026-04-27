/**
 * YouTube Live Scan Service
 * Ported from supabase/functions/run-scan/index.ts
 * Replaces Supabase client calls with Prisma.
 */
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','about','into','through','during','before','after','above','below',
  'between','under','again','further','then','once','is','are','was','were','be',
  'been','being','have','has','had','do','does','did','will','would','could',
  'should','may','might','must','shall','can','need','dare','ought','used','it',
  'its','this','that','these','those','i','me','my','myself','we','our','ours',
  'ourselves','you','your','yours','yourself','yourselves','he','him','his',
  'himself','she','her','hers','herself','they','them','their','theirs',
  'themselves','what','which','who','whom','when','where','why','how','all',
  'each','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','s','t','just','don','now','live',
  'watch','video','news','breaking','latest','update','updates','hindi','english',
  'india','indian',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ErrorType = 'quota' | 'invalid' | 'rate_limit' | 'network' | 'forbidden' | 'other';

interface ApiKeyInfo { id: string; apiKey: string; name: string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function categorizeError(status: number, text: string): ErrorType {
  if (status === 403 && text.includes('quotaExceeded')) return 'quota';
  if (status === 403) return 'forbidden';
  if (status === 400 || status === 401) return 'invalid';
  if (status === 429) return 'rate_limit';
  if (status === 0 || text.includes('network') || text.includes('fetch')) return 'network';
  return 'other';
}

function isApproachingTimeout(start: number, limitMs = 55000): boolean {
  return Date.now() - start > limitMs;
}

function extractKeywords(title: string): string[] {
  const words = title.toLowerCase().replace(/[^\w\s#]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !w.startsWith('#'));
  return [...new Set(words)];
}

function extractTags(title: string, tags: string[] = []): string[] {
  const hashtagRegex = /#[\w]+/g;
  const titleHashtags = (title.match(hashtagRegex) || []).map(t => t.toLowerCase());
  const processedTags = tags.filter(t => t.length < 30)
    .map(t => (t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, '')}`));
  return [...new Set([...titleHashtags, ...processedTags])];
}

// ---------------------------------------------------------------------------
// Safe upsert for YtScanChannelStatus (works without unique index name)
// ---------------------------------------------------------------------------
async function upsertScanChannelStatus(
  scanId: string,
  channelId: string,
  status: string,
  streamsFound: number,
  errorMessage: string | null
) {
  const existing = await prisma.ytScanChannelStatus.findFirst({ where: { scanId, channelId } });
  if (existing) {
    await prisma.ytScanChannelStatus.update({
      where: { id: existing.id },
      data: { status, streamsFound, errorMessage },
    });
  } else {
    await prisma.ytScanChannelStatus.create({
      data: { scanId, channelId, status, streamsFound, errorMessage },
    });
  }
}

// ---------------------------------------------------------------------------
// API Key Manager (Prisma-based)
// ---------------------------------------------------------------------------
export class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];
  private requestCounter = 0;
  private exhaustedKeys = new Set<string>();
  private keyUsageCount = new Map<string, number>();

  async loadKeys(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Auto-reset keys whose quota expired more than 24h ago
    await prisma.ytApiKey.updateMany({
      where: {
        isActive: true,
        quotaExceededAt: { not: null, lt: twentyFourHoursAgo },
      },
      data: { quotaExceededAt: null, errorType: null, consecutiveErrors: 0 },
    });

    const dbKeys = await prisma.ytApiKey.findMany({
      where: { isActive: true, quotaExceededAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, apiKey: true, name: true },
    });

    if (dbKeys.length === 0) throw new Error('No YouTube API keys available. Please add keys in the API Keys section.');
    this.keys = dbKeys;
    console.log(`Loaded ${this.keys.length} API key(s): ${this.keys.map(k => k.name).join(', ')}`);
    this.keys.forEach(k => this.keyUsageCount.set(k.id, 0));
  }

  getCurrentKey(): ApiKeyInfo | null {
    const available = this.keys.filter(k => !this.exhaustedKeys.has(k.id));
    if (available.length === 0) return null;
    const key = available[this.requestCounter % available.length];
    this.requestCounter++;
    this.keyUsageCount.set(key.id, (this.keyUsageCount.get(key.id) || 0) + 1);
    return key;
  }

  async markExhausted(id: string, errorType: ErrorType, message: string): Promise<void> {
    this.exhaustedKeys.add(id);
    const current = await prisma.ytApiKey.findUnique({ where: { id }, select: { consecutiveErrors: true } });
    await prisma.ytApiKey.update({
      where: { id },
      data: {
        lastError: message,
        lastErrorAt: new Date(),
        errorType,
        consecutiveErrors: (current?.consecutiveErrors || 0) + 1,
        ...(errorType === 'quota' ? { quotaExceededAt: new Date() } : {}),
      },
    });
  }

  async clearError(id: string): Promise<void> {
    await prisma.ytApiKey.update({
      where: { id },
      data: { lastError: null, lastErrorAt: null, errorType: null, consecutiveErrors: 0 },
    });
  }

  async updateLastUsed(id: string): Promise<void> {
    await prisma.ytApiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  hasAvailable(): boolean { return this.keys.filter(k => !this.exhaustedKeys.has(k.id)).length > 0; }
  getTotalCount(): number { return this.keys.length; }
  getExhaustedCount(): number { return this.exhaustedKeys.size; }
}

// ---------------------------------------------------------------------------
// Fetch with key rotation + retries
// ---------------------------------------------------------------------------
export async function fetchWithRetry(
  url: string,
  keyManager: ApiKeyManager,
  maxRetries = 3
): Promise<{ response: Response | null; error: string | null; allExhausted: boolean }> {
  let lastError: string | null = null;
  let networkRetries = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const key = keyManager.getCurrentKey();
    if (!key) return { response: null, error: 'All API keys exhausted', allExhausted: true };

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.set('key', key.apiKey);

    try {
      const response = await fetch(urlWithKey.toString());
      if (response.ok) {
        await keyManager.updateLastUsed(key.id);
        await keyManager.clearError(key.id);
        return { response, error: null, allExhausted: false };
      }

      const errorText = await response.text();
      const errorType = categorizeError(response.status, errorText);

      if (['quota', 'invalid', 'forbidden'].includes(errorType)) {
        await keyManager.markExhausted(key.id, errorType as ErrorType, `${response.status}: ${errorText.slice(0, 200)}`);
        if (keyManager.hasAvailable()) continue;
        return { response: null, error: `All keys exhausted: ${errorType}`, allExhausted: true };
      }

      if (errorType === 'rate_limit') {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
        continue;
      }

      lastError = `YouTube API error ${response.status}: ${errorText.slice(0, 200)}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      networkRetries++;
      if (networkRetries < 3) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, networkRetries - 1), 4000)));
        attempt--;
        continue;
      }
      await keyManager.markExhausted(key.id, 'network', msg);
      lastError = `Network error: ${msg}`;
      networkRetries = 0;
      if (keyManager.hasAvailable()) continue;
    }
  }

  return { response: null, error: lastError || 'Failed to fetch from YouTube API', allExhausted: !keyManager.hasAvailable() };
}

// ---------------------------------------------------------------------------
// Resolve Channel ID from URL
// ---------------------------------------------------------------------------
export async function resolveChannelId(keyManager: ApiKeyManager, youtubeUrl: string): Promise<string | null> {
  try {
    const url = new URL(youtubeUrl);
    const path = url.pathname;

    if (path.startsWith('/channel/')) {
      const id = path.split('/')[2];
      if (id?.startsWith('UC')) return id;
    }

    let identifier: string | null = null;
    let searchType: 'forHandle' | 'forUsername' = 'forHandle';

    if (path.startsWith('/@')) { identifier = path.substring(2).split('/')[0]; searchType = 'forHandle'; }
    else if (path.startsWith('/c/')) { identifier = path.split('/')[2]; searchType = 'forHandle'; }
    else if (path.startsWith('/user/')) { identifier = path.split('/')[2]; searchType = 'forUsername'; }

    if (!identifier) return null;

    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    apiUrl.searchParams.set('part', 'id');
    apiUrl.searchParams.set(searchType, identifier);

    const { response, error } = await fetchWithRetry(apiUrl.toString(), keyManager);
    if (error || !response) return null;

    const data = await response.json();
    if (data.items?.length > 0) return data.items[0].id;

    if (searchType === 'forHandle') {
      apiUrl.searchParams.delete('forHandle');
      apiUrl.searchParams.set('forUsername', identifier);
      const { response: r2 } = await fetchWithRetry(apiUrl.toString(), keyManager);
      if (r2) { const d2 = await r2.json(); if (d2.items?.length > 0) return d2.items[0].id; }
    }

    return null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// THE MAIN LIVE SCAN
// ---------------------------------------------------------------------------
export async function runLiveScan(channelIdToRefresh?: string): Promise<{
  success: boolean; scanId?: string; channelsScanned?: number;
  liveStreamsFound?: number; completionReason?: string; error?: string;
}> {
  const scanStartTime = Date.now();
  const isSingle = !!channelIdToRefresh;
  console.log(isSingle ? `Single channel refresh: ${channelIdToRefresh}` : 'Starting full live scan...');

  const keyManager = new ApiKeyManager();
  await keyManager.loadKeys();

  let scanId: string;
  if (isSingle) {
    const latest = await prisma.ytScan.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (!latest) throw new Error('No existing scan to update');
    scanId = latest.id;
  } else {
    const scan = await prisma.ytScan.create({ data: { notes: 'Automated scan' } });
    scanId = scan.id;
  }
  console.log(`Scan ID: ${scanId}`);

  const channelWhere = isSingle
    ? { isActive: true, id: channelIdToRefresh! }
    : { isActive: true };
  const channels = await prisma.ytChannel.findMany({ where: channelWhere });
  console.log(`Found ${channels.length} channel(s) to scan`);

  // Insert pending statuses upfront for progress UI
  if (!isSingle && channels.length > 0) {
    for (const c of channels) {
      await upsertScanChannelStatus(scanId, c.id, 'pending', 0, null);
    }
  }

  // Resolve missing channel IDs
  const withIds: { id: string; youtubeChannelId: string; displayName: string }[] = [];
  const withoutIds = channels.filter(c => !c.youtubeChannelId);
  const alreadyHaveIds = channels.filter(c => !!c.youtubeChannelId);
  withIds.push(...alreadyHaveIds.map(c => ({ id: c.id, youtubeChannelId: c.youtubeChannelId!, displayName: c.displayName })));

  for (const ch of withoutIds) {
    if (isApproachingTimeout(scanStartTime)) {
      await upsertScanChannelStatus(scanId, ch.id, 'failed', 0, 'Timed out before resolution');
      continue;
    }
    const resolved = await resolveChannelId(keyManager, ch.youtubeUrl);
    if (resolved) {
      await prisma.ytChannel.update({ where: { id: ch.id }, data: { youtubeChannelId: resolved } });
      withIds.push({ id: ch.id, youtubeChannelId: resolved, displayName: ch.displayName });
    } else {
      await upsertScanChannelStatus(scanId, ch.id, 'failed', 0, 'Failed to resolve channel ID');
    }
  }

  // Search each channel for live streams (batches of 10)
  const searchResults: { channelDbId: string; channelYtId: string; streams: any[] }[] = [];
  let timedOut = false;
  const batchSize = 10;

  for (let i = 0; i < withIds.length; i += batchSize) {
    if (isApproachingTimeout(scanStartTime)) { timedOut = true; break; }
    const batch = withIds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async ch => {
      const { streams, timedOut: t } = await searchLiveStreams(keyManager, ch.youtubeChannelId, ch.id, scanId, scanStartTime);
      if (t) timedOut = true;
      return { channelDbId: ch.id, channelYtId: ch.youtubeChannelId, streams };
    }));
    searchResults.push(...results);
    if (timedOut) break;
  }

  // Collect all video IDs
  const allVideoIds: string[] = [];
  const videoToChannel = new Map<string, string>();
  for (const { channelDbId, streams } of searchResults) {
    for (const s of streams) {
      allVideoIds.push(s.id.videoId);
      videoToChannel.set(s.id.videoId, channelDbId);
    }
  }

  console.log(`Total live streams found: ${allVideoIds.length}`);
  if (allVideoIds.length === 0) {
    return { success: true, scanId, channelsScanned: channels.length, liveStreamsFound: 0, completionReason: timedOut ? 'timeout' : 'complete' };
  }

  const videoDetails = await getVideoDetails(keyManager, allVideoIds, scanStartTime);

  const existingStreams = await prisma.ytStream.findMany({
    where: { videoId: { in: allVideoIds } },
    select: { id: true, videoId: true },
  });
  const existingMap = new Map(existingStreams.map(s => [s.videoId, s.id]));

  const newStreams: any[] = [];
  const streamUpdates: { id: string; data: any }[] = [];
  const metricsBuffer: { streamId?: string; concurrentViewers: number; viewCount: number | null; likeCount: number | null; channelDbId: string }[] = [];
  const channelMetrics = new Map<string, { total: number; highest: number; count: number }>();
  const keywordStats = new Map<string, { count: number; totalViewers: number }>();
  const tagStats = new Map<string, { count: number; totalViewers: number }>();

  for (const video of videoDetails) {
    const channelDbId = videoToChannel.get(video.id);
    if (!channelDbId) continue;

    const viewers = parseInt(video.liveStreamingDetails?.concurrentViewers || '0');
    const viewCount = video.statistics?.viewCount ? parseInt(video.statistics.viewCount) : null;
    const likeCount = video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : null;

    const existingId = existingMap.get(video.id);
    if (existingId) {
      streamUpdates.push({ id: existingId, data: { title: video.snippet.title, description: video.snippet.description, tags: JSON.stringify(video.snippet.tags || []), language: video.snippet.defaultAudioLanguage } });
      metricsBuffer.push({ streamId: existingId, concurrentViewers: viewers, viewCount, likeCount, channelDbId });
    } else {
      newStreams.push({ videoId: video.id, channelId: channelDbId, title: video.snippet.title, description: video.snippet.description, firstSeenScanId: scanId, tags: JSON.stringify(video.snippet.tags || []), language: video.snippet.defaultAudioLanguage, _viewers: viewers, _views: viewCount, _likes: likeCount });
    }

    const cm = channelMetrics.get(channelDbId) || { total: 0, highest: 0, count: 0 };
    cm.total += viewers; cm.highest = Math.max(cm.highest, viewers); cm.count++;
    channelMetrics.set(channelDbId, cm);

    for (const kw of extractKeywords(video.snippet.title)) {
      const k = keywordStats.get(kw) || { count: 0, totalViewers: 0 };
      k.count++; k.totalViewers += viewers; keywordStats.set(kw, k);
    }
    for (const tag of extractTags(video.snippet.title, video.snippet.tags)) {
      const t = tagStats.get(tag) || { count: 0, totalViewers: 0 };
      t.count++; t.totalViewers += viewers; tagStats.set(tag, t);
    }
  }

  // Batch insert new streams
  if (newStreams.length > 0) {
    const toInsert = newStreams.map(({ _viewers, _views, _likes, ...s }) => s);
    await prisma.ytStream.createMany({ data: toInsert });

    const newlyInserted = await prisma.ytStream.findMany({
      where: { videoId: { in: newStreams.map(s => s.videoId) } },
      select: { id: true, videoId: true },
    });
    for (const s of newlyInserted) {
      const orig = newStreams.find(ns => ns.videoId === s.videoId);
      if (orig) metricsBuffer.push({ streamId: s.id, concurrentViewers: orig._viewers, viewCount: orig._views, likeCount: orig._likes, channelDbId: videoToChannel.get(s.videoId)! });
    }
  }

  await Promise.all(streamUpdates.map(({ id, data }) => prisma.ytStream.update({ where: { id }, data })));

  if (metricsBuffer.length > 0) {
    await prisma.ytStreamScanMetric.createMany({
      data: metricsBuffer.filter(m => m.streamId).map(m => ({
        scanId, streamId: m.streamId!, concurrentViewers: m.concurrentViewers,
        viewCount: m.viewCount ? BigInt(m.viewCount) : null,
        likeCount: m.likeCount ? BigInt(m.likeCount) : null,
        isLive: true,
      })),
    });
  }

  if (channelMetrics.size > 0) {
    await prisma.ytScanChannelSummary.createMany({
      data: Array.from(channelMetrics.entries()).map(([chId, m]) => ({
        scanId, channelId: chId,
        totalConcurrentViews: m.total,
        highestConcurrent: m.highest,
        numberOfStreams: m.count,
        averagePeakPerStream: m.count > 0 ? Math.round(m.total / m.count) : 0,
      })),
    });
  }

  if (keywordStats.size > 0) {
    await prisma.ytScanKeywordStat.createMany({
      data: Array.from(keywordStats.entries()).map(([keyword, s]) => ({
        scanId, keyword, usageCount: s.count, totalConcurrentViews: s.totalViewers,
        avgConcurrentViews: Math.round(s.totalViewers / s.count),
      })),
    });
  }

  if (tagStats.size > 0) {
    await prisma.ytScanTagStat.createMany({
      data: Array.from(tagStats.entries()).map(([tag, s]) => ({
        scanId, tag, usageCount: s.count, totalConcurrentViews: s.totalViewers,
        avgConcurrentViews: Math.round(s.totalViewers / s.count),
      })),
    });
  }

  console.log('Live scan completed successfully');
  return {
    success: true, scanId, channelsScanned: channels.length,
    liveStreamsFound: videoDetails.length,
    completionReason: timedOut ? 'timeout' : 'complete',
  };
}

// ---------------------------------------------------------------------------
// Search a single channel for live streams
// ---------------------------------------------------------------------------
async function searchLiveStreams(
  keyManager: ApiKeyManager,
  channelYtId: string,
  channelDbId: string,
  scanId: string,
  scanStartTime: number
): Promise<{ streams: any[]; timedOut: boolean }> {
  const allItems: any[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  let lastError: string | null = null;
  let timedOut = false;

  try {
    do {
      if (isApproachingTimeout(scanStartTime)) { timedOut = true; break; }

      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('channelId', channelYtId);
      url.searchParams.set('eventType', 'live');
      url.searchParams.set('type', 'video');
      url.searchParams.set('maxResults', '50');
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

      const { response, error } = await fetchWithRetry(url.toString(), keyManager);
      if (error || !response) { lastError = error; break; }

      const data = await response.json();
      if (data.items?.length > 0) allItems.push(...data.items);
      nextPageToken = data.nextPageToken || null;
      pageCount++;
    } while (nextPageToken && pageCount < 5);

    const status = timedOut ? 'partial' : lastError ? (allItems.length > 0 ? 'partial' : 'failed') : 'success';
    const errorMsg = timedOut ? 'Timed out during search' : lastError;

    await upsertScanChannelStatus(scanId, channelDbId, status, allItems.length, errorMsg);
    return { streams: allItems, timedOut };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await upsertScanChannelStatus(scanId, channelDbId, 'failed', 0, msg);
    return { streams: allItems, timedOut: false };
  }
}

// ---------------------------------------------------------------------------
// Get video details (batches of 50)
// ---------------------------------------------------------------------------
async function getVideoDetails(keyManager: ApiKeyManager, videoIds: string[], scanStartTime: number): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    if (isApproachingTimeout(scanStartTime)) break;
    const batch = videoIds.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,liveStreamingDetails,statistics');
    url.searchParams.set('id', batch.join(','));
    const { response } = await fetchWithRetry(url.toString(), keyManager);
    if (response) { const data = await response.json(); if (data.items) results.push(...data.items); }
  }
  return results;
}
