/**
 * VOD Scan Service
 * Ported from supabase/functions/run-vod-scan/index.ts
 * Uses Prisma instead of Supabase client.
 */
import { prisma } from '../db.js';
import { ApiKeyManager, fetchWithRetry } from './scanService.js';

// ---------------------------------------------------------------------------
// Constants
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
  'india','indian','full','new','official',
]);

function isApproachingTimeout(start: number, limitMs = 55000) {
  return Date.now() - start > limitMs;
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1]||'0')*3600 + parseInt(m[2]||'0')*60 + parseInt(m[3]||'0');
}

function extractKeywords(title: string): string[] {
  const words = title.toLowerCase().replace(/[^\w\s#]/g,' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !w.startsWith('#'));
  return [...new Set(words)];
}

function extractTags(title: string, tags: string[] = []): string[] {
  const titleHashtags = (title.match(/#[\w]+/g) || []).map(t => t.toLowerCase());
  const processed = tags.filter(t => t.length < 30)
    .map(t => t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g,'')}`);
  return [...new Set([...titleHashtags, ...processed])];
}

// ---------------------------------------------------------------------------
// Get uploads playlist ID for a channel
// ---------------------------------------------------------------------------
async function getUploadsPlaylistId(
  keyManager: ApiKeyManager,
  channelDbId: string,
  channelYtId: string,
  cached: string | null
): Promise<{ playlistId: string | null; allExhausted: boolean }> {
  if (cached) return { playlistId: cached, allExhausted: false };

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', channelYtId);

  const { response, error, allExhausted } = await fetchWithRetry(url.toString(), keyManager);
  if (error || !response) return { playlistId: null, allExhausted: allExhausted ?? false };

  const data: any = await response.json();
  const playlistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return { playlistId: null, allExhausted: false };

  await prisma.ytChannel.update({ where: { id: channelDbId }, data: { uploadsPlaylistId: playlistId } });
  return { playlistId, allExhausted: false };
}

// ---------------------------------------------------------------------------
// Get video IDs from uploads playlist
// ---------------------------------------------------------------------------
async function getPlaylistVideoIds(
  keyManager: ApiKeyManager,
  playlistId: string,
  maxVideos: number,
  publishedAfter: Date | null,
  scanStartTime: number
): Promise<{ videoIds: string[]; lastPublishedAt: string | null; stoppedEarly: boolean; allExhausted: boolean }> {
  const videoIds: string[] = [];
  let nextPageToken: string | null = null;
  let lastPublishedAt: string | null = null;
  let stoppedEarly = false;
  let allExhausted = false;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

    const { response, error, allExhausted: ex } = await fetchWithRetry(url.toString(), keyManager);
    if (error || !response) { allExhausted = ex ?? false; break; }

    const data: any = await response.json();
    for (const item of (data.items || [])) {
      const videoId = item.snippet?.resourceId?.videoId;
      const publishedAt = item.snippet?.publishedAt;
      if (!videoId) continue;

      if (publishedAfter && publishedAt && new Date(publishedAt) < publishedAfter) {
        stoppedEarly = true;
        return { videoIds, lastPublishedAt, stoppedEarly, allExhausted: false };
      }

      videoIds.push(videoId);
      if (!lastPublishedAt || publishedAt > lastPublishedAt) lastPublishedAt = publishedAt;
      if (videoIds.length >= maxVideos) return { videoIds, lastPublishedAt, stoppedEarly, allExhausted: false };
    }

    nextPageToken = data.nextPageToken || null;
    if (nextPageToken && isApproachingTimeout(scanStartTime)) break;
  } while (nextPageToken && videoIds.length < maxVideos);

  return { videoIds, lastPublishedAt, stoppedEarly, allExhausted };
}

// ---------------------------------------------------------------------------
// Persist a batch of VOD videos + metrics
// ---------------------------------------------------------------------------
async function persistVideoBatch(
  videos: any[],
  channelDbId: string,
  scanId: string
): Promise<number> {
  if (videos.length === 0) return 0;

  const videoIds = videos.map(v => v.id);
  const existing = await prisma.ytVodVideo.findMany({
    where: { videoId: { in: videoIds } },
    select: { id: true, videoId: true },
  });
  const existingMap = new Map(existing.map(v => [v.videoId, v.id]));

  const toInsert = videos.filter(v => !existingMap.has(v.id)).map(v => ({
    videoId: v.id,
    channelId: channelDbId,
    title: v.snippet.title,
    description: v.snippet.description || '',
    tags: JSON.stringify(v.snippet.tags || []),
    duration: v.contentDetails?.duration || null,
    durationSeconds: parseDuration(v.contentDetails?.duration || ''),
    language: v.snippet.defaultAudioLanguage || null,
    categoryId: v.snippet.categoryId || null,
    thumbnailUrl: v.snippet.thumbnails?.high?.url || null,
    hasCaptions: v.contentDetails?.caption === 'true',
    isLicensedContent: v.contentDetails?.licensedContent || false,
    privacyStatus: v.status?.privacyStatus || null,
    publishedAt: new Date(v.snippet.publishedAt),
    firstSeenScanId: scanId,
  }));

  if (toInsert.length > 0) {
    const inserted = await prisma.ytVodVideo.createMany({ data: toInsert });
    // Re-fetch new IDs
    const newRecords = await prisma.ytVodVideo.findMany({
      where: { videoId: { in: toInsert.map(v => v.videoId) } },
      select: { id: true, videoId: true },
    });
    newRecords.forEach(r => existingMap.set(r.videoId, r.id));
  }

  // Upsert metrics
  const metricsRows = videos.map(v => {
    const dbId = existingMap.get(v.id);
    if (!dbId) return null;
    return {
      videoId: dbId,
      scanId,
      viewCount: BigInt(v.statistics?.viewCount || '0'),
      likeCount: v.statistics?.likeCount ? BigInt(v.statistics.likeCount) : null,
      commentCount: v.statistics?.commentCount ? BigInt(v.statistics.commentCount) : null,
      favoriteCount: v.statistics?.favoriteCount ? BigInt(v.statistics.favoriteCount) : null,
    };
  }).filter(Boolean) as any[];

  if (metricsRows.length > 0) {
    await prisma.ytVodMetric.createMany({ data: metricsRows });
  }

  // Upsert video statuses
  const statusRows = videos.map(v => ({
    scanId, videoId: v.id, channelId: channelDbId, status: 'success',
  }));
  await prisma.ytVodScanVideoStatus.createMany({ data: statusRows });

  return metricsRows.length;
}

// ---------------------------------------------------------------------------
// Process one channel: playlist → video details → persist
// ---------------------------------------------------------------------------
async function processChannel(
  keyManager: ApiKeyManager,
  channel: { id: string; youtubeChannelId: string; displayName: string; uploadsPlaylistId: string | null },
  scanId: string,
  videosPerChannel: number,
  dailyCutoff: Date | null,
  scanStartTime: number
): Promise<{ fetched: number; allExhausted: boolean; status: string; errorMsg: string | null; lastPublishedAt: string | null }> {
  console.log(`VOD: Processing ${channel.displayName}`);

  await upsertChannelStatus(scanId, channel.id, 'processing', videosPerChannel, 0, null, null);

  const { playlistId, allExhausted: ex1 } = await getUploadsPlaylistId(
    keyManager, channel.id, channel.youtubeChannelId, channel.uploadsPlaylistId
  );
  if (ex1) {
    await upsertChannelStatus(scanId, channel.id, 'failed', videosPerChannel, 0, 'Quota exhausted', null);
    return { fetched: 0, allExhausted: true, status: 'failed', errorMsg: 'Quota exhausted', lastPublishedAt: null };
  }
  if (!playlistId) {
    await upsertChannelStatus(scanId, channel.id, 'failed', videosPerChannel, 0, 'No uploads playlist', null);
    return { fetched: 0, allExhausted: false, status: 'failed', errorMsg: 'No uploads playlist', lastPublishedAt: null };
  }

  const { videoIds, lastPublishedAt, stoppedEarly, allExhausted: ex2 } = await getPlaylistVideoIds(
    keyManager, playlistId, videosPerChannel, dailyCutoff, scanStartTime
  );

  if (ex2 && videoIds.length === 0) {
    await upsertChannelStatus(scanId, channel.id, 'failed', videosPerChannel, 0, 'Quota exhausted during playlist fetch', null);
    return { fetched: 0, allExhausted: true, status: 'failed', errorMsg: 'Quota exhausted during playlist fetch', lastPublishedAt: null };
  }

  if (videoIds.length === 0) {
    const msg = stoppedEarly ? 'No videos in last 48h' : 'No videos found';
    await upsertChannelStatus(scanId, channel.id, 'success', videosPerChannel, 0, msg, null);
    return { fetched: 0, allExhausted: false, status: 'success', errorMsg: null, lastPublishedAt: null };
  }

  // Fetch video details in batches of 50, persist in sub-batches of 25
  let totalPersisted = 0;
  let allExhausted = false;

  for (let i = 0; i < videoIds.length; i += 50) {
    if (isApproachingTimeout(scanStartTime)) {
      const status = totalPersisted > 0 ? 'partial' : 'failed';
      const msg = `Timeout after ${totalPersisted}/${videoIds.length} videos`;
      await upsertChannelStatus(scanId, channel.id, status, videosPerChannel, totalPersisted, msg, lastPublishedAt);
      return { fetched: totalPersisted, allExhausted: false, status, errorMsg: msg, lastPublishedAt };
    }

    const batch = videoIds.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails,statistics,status');
    url.searchParams.set('id', batch.join(','));

    const { response, error, allExhausted: ex } = await fetchWithRetry(url.toString(), keyManager);
    if (error || !response) { allExhausted = ex ?? false; if (allExhausted) break; continue; }

    const data: any = await response.json();
    const fetched: any[] = data.items || [];

    // Persist in 25-video sub-batches
    for (let j = 0; j < fetched.length; j += 25) {
      if (isApproachingTimeout(scanStartTime)) {
        const status = totalPersisted > 0 ? 'partial' : 'failed';
        const msg = `Timeout during persistence after ${totalPersisted} videos`;
        await upsertChannelStatus(scanId, channel.id, status, videosPerChannel, totalPersisted, msg, lastPublishedAt);
        return { fetched: totalPersisted, allExhausted: false, status, errorMsg: msg, lastPublishedAt };
      }
      const subBatch = fetched.slice(j, j + 25);
      const count = await persistVideoBatch(subBatch, channel.id, scanId);
      totalPersisted += count;
      await upsertChannelStatus(scanId, channel.id, 'processing', videosPerChannel, totalPersisted, null, lastPublishedAt);
    }
  }

  let finalStatus = 'success';
  let finalMsg: string | null = null;
  if (totalPersisted === 0 && videoIds.length > 0) { finalStatus = 'failed'; finalMsg = 'No videos fetched'; }
  else if (totalPersisted < videoIds.length || allExhausted) { finalStatus = 'partial'; finalMsg = `Fetched ${totalPersisted}/${videoIds.length}`; }

  await upsertChannelStatus(scanId, channel.id, finalStatus, videosPerChannel, totalPersisted, finalMsg, lastPublishedAt);
  return { fetched: totalPersisted, allExhausted, status: finalStatus, errorMsg: finalMsg, lastPublishedAt };
}

async function upsertChannelStatus(
  scanId: string, channelId: string, status: string,
  videosRequested: number, videosFetched: number,
  errorMessage: string | null, lastVideoPublishedAt: string | null
) {
  const existing = await prisma.ytVodScanChannelStatus.findFirst({ where: { scanId, channelId } });
  const publishedAtDate = lastVideoPublishedAt ? new Date(lastVideoPublishedAt) : null;
  if (existing) {
    await prisma.ytVodScanChannelStatus.update({
      where: { id: existing.id },
      data: { status, videosFetched, errorMessage, lastVideoPublishedAt: publishedAtDate },
    });
  } else {
    await prisma.ytVodScanChannelStatus.create({
      data: { scanId, channelId, status, videosRequested, videosFetched, errorMessage, lastVideoPublishedAt: publishedAtDate },
    });
  }
}

// ---------------------------------------------------------------------------
// THE MAIN VOD SCAN (exported)
// ---------------------------------------------------------------------------
export interface VodScanOptions {
  scanType?: 'full' | 'incremental' | 'single_channel' | 'daily';
  channelId?: string | null;
  dailyOnly?: boolean;
  videosPerChannel?: number;
  resumeScanId?: string | null;
}

export async function runVodScan(opts: VodScanOptions = {}): Promise<any> {
  const scanStartTime = Date.now();
  let { scanType = 'daily', channelId = null, dailyOnly = true, resumeScanId = null } = opts;
  let videosPerChannel = dailyOnly ? 50 : Math.min(opts.videosPerChannel || 50, 500);
  if (channelId) scanType = 'single_channel';

  const dailyCutoff = dailyOnly ? new Date(Date.now() - 48 * 60 * 60 * 1000) : null;
  console.log(`VOD Scan: type=${scanType}, videos=${videosPerChannel}, dailyOnly=${dailyOnly}, resume=${resumeScanId || 'new'}`);

  const keyManager = new ApiKeyManager();
  await keyManager.loadKeys();

  // Resolve or create scan record
  let scan: any;
  let startIndex = 0;
  let existingFetched = 0, existingRequested = 0, existingSucceeded = 0, existingFailed = 0, existingPartial = 0;

  if (resumeScanId) {
    scan = await prisma.ytVodScan.findUnique({ where: { id: resumeScanId } });
    if (!scan) throw new Error(`Scan ${resumeScanId} not found`);
    if (scan.isComplete) return { success: true, scanId: resumeScanId, message: 'Scan already complete', isComplete: true };
    startIndex = scan.lastProcessedChannelIndex || 0;
    existingFetched = scan.totalVideosFetched || 0;
    existingRequested = scan.totalVideosRequested || 0;
    existingSucceeded = scan.channelsSucceeded || 0;
    existingFailed = scan.channelsFailed || 0;
    existingPartial = scan.channelsPartial || 0;
    videosPerChannel = scan.videosPerChannel;
    console.log(`Resuming VOD scan from index ${startIndex}`);
  } else {
    scan = await prisma.ytVodScan.create({
      data: {
        scanType, videosPerChannel, isResumable: true,
        lastProcessedChannelIndex: 0,
        dateRangeStart: dailyCutoff,
        dateRangeEnd: new Date(),
      },
    });
    console.log(`Created VOD scan: ${scan.id}`);
  }

  // Fetch channels
  const channelFilter: any = { isActive: true, youtubeChannelId: { not: null } };
  if (channelId) channelFilter.id = channelId;
  const rawChannels = await prisma.ytChannel.findMany({ where: channelFilter });

  // Interleave TIMES and COMPETITION channels for balanced scanning
  const times = rawChannels.filter(c => c.networkGroup === 'TIMES');
  const competition = rawChannels.filter(c => c.networkGroup === 'COMPETITION');
  const other = rawChannels.filter(c => c.networkGroup !== 'TIMES' && c.networkGroup !== 'COMPETITION');
  const validChannels: typeof rawChannels = [];
  const maxLen = Math.max(times.length, competition.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < times.length) validChannels.push(times[i]);
    if (i < competition.length) validChannels.push(competition[i]);
  }
  validChannels.push(...other);

  const total = validChannels.length;
  console.log(`Scanning ${total} channels, starting from index ${startIndex}`);

  // Pre-init pending statuses for new scans
  if (!resumeScanId && total > 0) {
    for (let i = 0; i < total; i += 50) {
      const batch = validChannels.slice(i, i + 50);
      await prisma.ytVodScanChannelStatus.createMany({
        data: batch.map(ch => ({
          scanId: scan.id, channelId: ch.id, status: 'pending',
          videosRequested: videosPerChannel, videosFetched: 0,
        })),
      });
    }
  }

  let totalRequested = existingRequested;
  let totalFetched = existingFetched;
  let channelsSucceeded = existingSucceeded;
  let channelsFailed = existingFailed;
  let channelsPartial = existingPartial;
  let allExhausted = false;
  let timedOut = false;
  let lastProcessedIndex = startIndex;

  for (let i = startIndex; i < validChannels.length; i++) {
    if (isApproachingTimeout(scanStartTime)) { timedOut = true; break; }
    if (allExhausted) break;

    const ch = validChannels[i];
    console.log(`[${i+1}/${total}] ${ch.displayName}`);
    totalRequested += videosPerChannel;

    const result = await processChannel(
      keyManager,
      { id: ch.id, youtubeChannelId: ch.youtubeChannelId!, displayName: ch.displayName, uploadsPlaylistId: ch.uploadsPlaylistId },
      scan.id, videosPerChannel, dailyCutoff, scanStartTime
    );

    totalFetched += result.fetched;
    allExhausted = result.allExhausted;
    if (result.status === 'success') channelsSucceeded++;
    else if (result.status === 'failed') channelsFailed++;
    else if (result.status === 'partial') channelsPartial++;

    if (result.errorMsg?.includes('Timeout')) {
      timedOut = true;
      lastProcessedIndex = i + 1;
      await updateScanProgress(scan.id, totalRequested, totalFetched, channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex);
      break;
    }

    lastProcessedIndex = i + 1;
    await updateScanProgress(scan.id, totalRequested, totalFetched, channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex);
    console.log(`Progress: ${lastProcessedIndex}/${total} channels, ${totalFetched} videos`);
  }

  const isFullyComplete = lastProcessedIndex >= validChannels.length && !allExhausted;

  // Aggregate keyword + tag stats when fully complete
  if (isFullyComplete && !isApproachingTimeout(scanStartTime) && totalFetched > 0) {
    console.log('Aggregating VOD keyword/tag stats...');
    const scanVideos = await prisma.ytVodVideo.findMany({
      where: { channelId: { in: validChannels.map(c => c.id) } },
      select: { id: true, title: true, tags: true },
    });
    const scanMetrics = await prisma.ytVodMetric.findMany({
      where: { scanId: scan.id },
      select: { videoId: true, viewCount: true, likeCount: true },
    });
    const metricsMap = new Map(scanMetrics.map(m => [m.videoId, m]));

    const kwStats = new Map<string, { count: number; totalViews: bigint; totalLikes: bigint }>();
    const tagStats = new Map<string, { count: number; totalViews: bigint; totalLikes: bigint }>();

    for (const video of scanVideos) {
      const m = metricsMap.get(video.id);
      const views = BigInt(m?.viewCount || 0);
      const likes = BigInt(m?.likeCount || 0);

      for (const kw of extractKeywords(video.title)) {
        const cur = kwStats.get(kw) || { count: 0, totalViews: 0n, totalLikes: 0n };
        cur.count++; cur.totalViews += views; cur.totalLikes += likes;
        kwStats.set(kw, cur);
      }
      for (const tag of extractTags(video.title, JSON.parse((video.tags as string) || '[]'))) {
        const cur = tagStats.get(tag) || { count: 0, totalViews: 0n, totalLikes: 0n };
        cur.count++; cur.totalViews += views; cur.totalLikes += likes;
        tagStats.set(tag, cur);
      }
    }

    const kwRows = Array.from(kwStats.entries())
      .filter(([_, s]) => s.count >= 2)
      .map(([keyword, s]) => ({
        scanId: scan.id, keyword, usageCount: s.count,
        totalViews: s.totalViews, avgViews: s.count > 0 ? s.totalViews / BigInt(s.count) : 0n,
        totalLikes: s.totalLikes,
        avgEngagementRate: Number(s.totalViews) > 0 ? Number(s.totalLikes) / Number(s.totalViews) : 0,
      }));
    if (kwRows.length > 0) await prisma.ytVodKeywordStat.createMany({ data: kwRows });

    const tagRows = Array.from(tagStats.entries())
      .filter(([_, s]) => s.count >= 2)
      .map(([tag, s]) => ({
        scanId: scan.id, tag, usageCount: s.count,
        totalViews: s.totalViews, avgViews: s.count > 0 ? s.totalViews / BigInt(s.count) : 0n,
        totalLikes: s.totalLikes,
        avgEngagementRate: Number(s.totalViews) > 0 ? Number(s.totalLikes) / Number(s.totalViews) : 0,
      }));
    if (tagRows.length > 0) await prisma.ytVodTagStat.createMany({ data: tagRows });
  }

  const completionReason = timedOut ? 'timeout' : allExhausted ? 'quota_exhausted' : 'success';
  await updateScanProgress(scan.id, totalRequested, totalFetched, channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex, completionReason, isFullyComplete);

  console.log(`VOD scan ${isFullyComplete ? 'completed' : 'paused'}: ${totalFetched} videos, ${lastProcessedIndex}/${total} channels`);

  return {
    success: true, scanId: scan.id, scanType, isComplete: isFullyComplete,
    completionReason, canResume: !isFullyComplete && !allExhausted,
    summary: {
      channelsTotal: total, channelsProcessed: lastProcessedIndex,
      channelsRemaining: total - lastProcessedIndex,
      channelsSucceeded, channelsFailed, channelsPartial,
      videosRequested: totalRequested, videosFetched: totalFetched,
    },
  };
}

async function updateScanProgress(
  scanId: string, totalVideosRequested: number, totalVideosFetched: number,
  channelsSucceeded: number, channelsFailed: number, channelsPartial: number,
  keyManager: ApiKeyManager, lastProcessedIndex: number,
  completionReason: string | null = null, isComplete = false
) {
  await prisma.ytVodScan.update({
    where: { id: scanId },
    data: {
      totalVideosRequested, totalVideosFetched,
      channelsSucceeded, channelsFailed, channelsPartial,
      apiKeysUsed: keyManager.getTotalCount(),
      apiKeysExhausted: keyManager.getExhaustedCount(),
      isComplete, completionReason, lastProcessedChannelIndex: lastProcessedIndex,
    },
  });
}
