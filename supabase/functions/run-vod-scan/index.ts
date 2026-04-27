/**
 * VOD Scan Edge Function
 * 
 * Scans YouTube channels for VOD (Video on Demand) content.
 * Supports resumable scanning to handle edge function timeouts.
 * 
 * Key features:
 * - Resumable scans: Can continue from where it left off after timeout
 * - Batched DB writes: Upserts videos/metrics in chunks to avoid per-video round-trips
 * - Pre-initialized channel status: Shows progress immediately in UI
 * - Idempotent resume: Unique constraints prevent duplicate data
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout handling - Edge functions have ~60s limit, stop at 45s
const SCAN_TIMEOUT_MS = 45000;
const VIDEO_BATCH_SIZE = 25; // Persist every 25 videos

function isApproachingTimeout(scanStartTime: number): boolean {
  return Date.now() - scanStartTime > SCAN_TIMEOUT_MS;
}

// Stop words to filter from keyword extraction
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "it",
  "its", "this", "that", "these", "those", "i", "me", "my", "myself", "we", "our", "ours",
  "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his",
  "himself", "she", "her", "hers", "herself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "when", "where", "why", "how", "all",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only",
  "own", "same", "so", "than", "too", "very", "s", "t", "just", "don", "now", "live",
  "watch", "video", "news", "breaking", "latest", "update", "updates", "hindi", "english",
  "india", "indian", "full", "new", "official",
]);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface YouTubePlaylistItem {
  snippet: {
    resourceId: { videoId: string };
    title: string;
    publishedAt: string;
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    tags?: string[];
    defaultAudioLanguage?: string;
    categoryId?: string;
    publishedAt: string;
    thumbnails?: { high?: { url: string } };
  };
  contentDetails?: {
    duration?: string;
    caption?: string;
    licensedContent?: boolean;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
  status?: {
    privacyStatus?: string;
  };
}

interface ChannelWithId {
  id: string;
  youtube_channel_id: string;
  display_name: string;
  uploads_playlist_id: string | null;
}

interface ApiKeyInfo {
  id: string;
  api_key: string;
  name: string;
}

type ErrorType = "quota" | "invalid" | "rate_limit" | "network" | "forbidden" | "other";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function categorizeError(status: number, errorText: string): ErrorType {
  if (status === 403 && errorText.includes("quotaExceeded")) return "quota";
  if (status === 403) return "forbidden";
  if (status === 400 || status === 401) return "invalid";
  if (status === 429) return "rate_limit";
  if (status === 0 || errorText.includes("network") || errorText.includes("fetch")) return "network";
  return "other";
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}

// =============================================================================
// API KEY MANAGER
// =============================================================================

class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];
  private requestCounter = 0;
  private supabase: any;
  private exhaustedKeys: Set<string> = new Set();
  private keyUsageCount: Map<string, number> = new Map();
  private keyErrors: Map<string, { errorType: ErrorType; message: string }> = new Map();

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async loadKeys(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await this.supabase
      .from("yt_api_keys")
      .update({ quota_exceeded_at: null, error_type: null, consecutive_errors: 0 })
      .eq("is_active", true)
      .not("quota_exceeded_at", "is", null)
      .lt("quota_exceeded_at", twentyFourHoursAgo);

    const { data: dbKeys } = await this.supabase
      .from("yt_api_keys")
      .select("id, api_key, name")
      .eq("is_active", true)
      .is("quota_exceeded_at", null)
      .order("created_at", { ascending: true });

    if (dbKeys && dbKeys.length > 0) {
      this.keys = dbKeys;
      console.log(`Loaded ${this.keys.length} API keys: ${this.keys.map(k => k.name).join(", ")}`);
    } else {
      const envKey = Deno.env.get("YOUTUBE_API_KEY");
      if (envKey) {
        this.keys = [{ id: "env", api_key: envKey, name: "Environment Key" }];
      }
    }

    if (this.keys.length === 0) {
      throw new Error("No YouTube API keys available");
    }

    this.keys.forEach(k => this.keyUsageCount.set(k.id, 0));
  }

  getCurrentKeyInfo(): ApiKeyInfo | null {
    const availableKeys = this.keys.filter((k) => !this.exhaustedKeys.has(k.id));
    if (availableKeys.length === 0) return null;
    const index = this.requestCounter % availableKeys.length;
    this.requestCounter++;
    const selectedKey = availableKeys[index];
    this.keyUsageCount.set(selectedKey.id, (this.keyUsageCount.get(selectedKey.id) || 0) + 1);
    return selectedKey;
  }

  async markKeyExhausted(keyId: string, errorType: ErrorType, errorMessage: string): Promise<void> {
    this.exhaustedKeys.add(keyId);
    this.keyErrors.set(keyId, { errorType, message: errorMessage });
    console.log(`API key ${keyId} exhausted: ${errorType}`);

    if (keyId !== "env") {
      const updateData: any = {
        last_error: errorMessage,
        last_error_at: new Date().toISOString(),
        error_type: errorType,
      };
      if (errorType === "quota") {
        updateData.quota_exceeded_at = new Date().toISOString();
      }
      const { data: currentKey } = await this.supabase
        .from("yt_api_keys")
        .select("consecutive_errors")
        .eq("id", keyId)
        .maybeSingle();
      updateData.consecutive_errors = (currentKey?.consecutive_errors || 0) + 1;
      await this.supabase.from("yt_api_keys").update(updateData).eq("id", keyId);
    }
  }

  async clearKeyError(keyId: string): Promise<void> {
    if (keyId !== "env") {
      await this.supabase.from("yt_api_keys").update({
        last_error: null, last_error_at: null, error_type: null, consecutive_errors: 0,
      }).eq("id", keyId);
    }
  }

  async updateLastUsed(keyId: string): Promise<void> {
    if (keyId !== "env") {
      await this.supabase.from("yt_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
    }
  }

  hasAvailableKeys(): boolean {
    return this.keys.filter((k) => !this.exhaustedKeys.has(k.id)).length > 0;
  }
  getExhaustedCount(): number { return this.exhaustedKeys.size; }
  getTotalKeyCount(): number { return this.keys.length; }

  logUsageStats(): void {
    console.log("=== VOD Scan API Key Usage ===");
    this.keys.forEach(key => {
      const count = this.keyUsageCount.get(key.id) || 0;
      const error = this.keyErrors.get(key.id);
      const status = error ? ` (${error.errorType}: ${error.message.slice(0, 50)})` : "";
      console.log(`  ${key.name}: ${count} requests${status}`);
    });
    console.log(`  Total: ${this.requestCounter} | Exhausted: ${this.exhaustedKeys.size}/${this.keys.length}`);
  }
}

// =============================================================================
// YOUTUBE API HELPERS
// =============================================================================

async function fetchWithRetry(
  url: string,
  keyManager: ApiKeyManager,
  maxRetries = 3
): Promise<{ response: Response | null; error: string | null; allKeysExhausted: boolean }> {
  let lastError: string | null = null;
  let networkRetries = 0;
  const maxNetworkRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyInfo = keyManager.getCurrentKeyInfo();
    if (!keyInfo) {
      return { response: null, error: "All API keys exhausted", allKeysExhausted: true };
    }

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.set("key", keyInfo.api_key);

    try {
      const response = await fetch(urlWithKey.toString());

      if (response.ok) {
        await keyManager.updateLastUsed(keyInfo.id);
        await keyManager.clearKeyError(keyInfo.id);
        return { response, error: null, allKeysExhausted: false };
      }

      const errorText = await response.text();
      const errorType = categorizeError(response.status, errorText);

      if (errorType === "quota" || errorType === "invalid" || errorType === "forbidden") {
        await keyManager.markKeyExhausted(keyInfo.id, errorType, `${response.status}: ${errorText.slice(0, 200)}`);
        if (keyManager.hasAvailableKeys()) continue;
        return { response: null, error: `All API keys exhausted. Last error: ${errorType}`, allKeysExhausted: true };
      }

      if (errorType === "rate_limit") {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      lastError = `YouTube API error: ${response.status} - ${errorText.slice(0, 200)}`;
    } catch (networkError) {
      const errorMessage = networkError instanceof Error ? networkError.message : "Network error";
      networkRetries++;
      if (networkRetries < maxNetworkRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, networkRetries - 1), 4000);
        await new Promise(r => setTimeout(r, backoffMs));
        attempt--;
        continue;
      }
      await keyManager.markKeyExhausted(keyInfo.id, "network", errorMessage);
      lastError = `Network error: ${errorMessage}`;
      networkRetries = 0;
      if (keyManager.hasAvailableKeys()) continue;
    }
  }

  return { response: null, error: lastError || "Failed to fetch from YouTube API", allKeysExhausted: !keyManager.hasAvailableKeys() };
}

async function getUploadsPlaylistId(
  keyManager: ApiKeyManager,
  supabase: any,
  channelDbId: string,
  channelId: string,
  cachedPlaylistId: string | null
): Promise<{ playlistId: string | null; error: string | null; allKeysExhausted: boolean }> {
  if (cachedPlaylistId) {
    return { playlistId: cachedPlaylistId, error: null, allKeysExhausted: false };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", channelId);

  const { response, error, allKeysExhausted } = await fetchWithRetry(url.toString(), keyManager);
  if (error || !response) return { playlistId: null, error, allKeysExhausted };

  const data = await response.json();
  const playlistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return { playlistId: null, error: "No uploads playlist found", allKeysExhausted: false };

  await supabase.from("yt_channels").update({ uploads_playlist_id: playlistId }).eq("id", channelDbId);
  return { playlistId, error: null, allKeysExhausted: false };
}

async function getPlaylistVideoIds(
  keyManager: ApiKeyManager,
  playlistId: string,
  maxVideos: number,
  publishedAfterDate?: Date,
  scanStartTime?: number
): Promise<{ videoIds: string[]; error: string | null; allKeysExhausted: boolean; lastPublishedAt: string | null; stoppedDueToOldContent: boolean }> {
  const videoIds: string[] = [];
  let nextPageToken: string | null = null;
  let lastPublishedAt: string | null = null;
  let allKeysExhausted = false;
  let stoppedDueToOldContent = false;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const { response, error, allKeysExhausted: keysExhausted } = await fetchWithRetry(url.toString(), keyManager);
    if (error || !response) { allKeysExhausted = keysExhausted; break; }

    const data = await response.json();
    if (data.items) {
      for (const item of data.items as YouTubePlaylistItem[]) {
        const videoId = item.snippet?.resourceId?.videoId;
        const publishedAt = item.snippet?.publishedAt;
        if (!videoId) continue;

        if (publishedAfterDate && publishedAt) {
          if (new Date(publishedAt) < publishedAfterDate) {
            console.log(`Stopping playlist fetch - found video from ${publishedAt} which is before ${publishedAfterDate.toISOString()}`);
            stoppedDueToOldContent = true;
            return { videoIds, error: null, allKeysExhausted: false, lastPublishedAt, stoppedDueToOldContent };
          }
        }

        videoIds.push(videoId);
        if (!lastPublishedAt || publishedAt > lastPublishedAt) lastPublishedAt = publishedAt;
        if (videoIds.length >= maxVideos) return { videoIds, error: null, allKeysExhausted: false, lastPublishedAt, stoppedDueToOldContent };
      }
    }

    nextPageToken = data.nextPageToken || null;
    if (nextPageToken && scanStartTime && isApproachingTimeout(scanStartTime)) {
      console.log(`Timeout approaching during playlist fetch, returning ${videoIds.length} videos collected so far`);
      break;
    }
  } while (nextPageToken && videoIds.length < maxVideos);

  return { videoIds, error: null, allKeysExhausted, lastPublishedAt, stoppedDueToOldContent };
}

async function getVideoDetails(
  keyManager: ApiKeyManager,
  videoIds: string[],
  scanStartTime?: number
): Promise<{ videos: YouTubeVideoItem[]; fetchedCount: number; error: string | null; allKeysExhausted: boolean }> {
  if (videoIds.length === 0) return { videos: [], fetchedCount: 0, error: null, allKeysExhausted: false };

  const batchSize = 50;
  const allVideos: YouTubeVideoItem[] = [];
  let allKeysExhausted = false;

  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,statistics,status");
    url.searchParams.set("id", batch.join(","));

    const { response, error, allKeysExhausted: keysExhausted } = await fetchWithRetry(url.toString(), keyManager);
    if (error || !response) {
      allKeysExhausted = keysExhausted;
      if (allKeysExhausted) break;
      continue;
    }

    const data = await response.json();
    if (data.items) allVideos.push(...data.items);

    if (scanStartTime && isApproachingTimeout(scanStartTime)) {
      console.log(`Timeout approaching during video detail fetch, returning ${allVideos.length}/${videoIds.length} videos`);
      break;
    }
  }

  return { videos: allVideos, fetchedCount: allVideos.length, error: allKeysExhausted ? "Quota exhausted" : null, allKeysExhausted };
}

// =============================================================================
// TEXT EXTRACTION
// =============================================================================

function extractKeywords(title: string): string[] {
  const words = title.toLowerCase().replace(/[^\w\s#]/g, " ").split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !word.startsWith("#"));
  return [...new Set(words)];
}

function extractTags(title: string, tags: string[] = []): string[] {
  const hashtagRegex = /#[\w]+/g;
  const titleHashtags = (title.match(hashtagRegex) || []).map((t) => t.toLowerCase());
  const processedTags = tags.filter((t) => t.length < 30)
    .map((t) => (t.startsWith("#") ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, "")}`));
  return [...new Set([...titleHashtags, ...processedTags])];
}

// =============================================================================
// BATCHED PERSISTENCE - Core fix for timeout issue
// =============================================================================

/**
 * Persists a batch of videos + metrics to DB using upserts (idempotent).
 * Returns the number of videos successfully persisted.
 */
async function persistVideoBatch(
  supabase: any,
  videos: YouTubeVideoItem[],
  channelId: string,
  scanId: string,
): Promise<number> {
  if (videos.length === 0) return 0;

  let persisted = 0;

  // Step 1: Get existing video records for these video_ids (single query)
  const videoIds = videos.map(v => v.id);
  const { data: existingVideos } = await supabase
    .from("yt_vod_videos")
    .select("id, video_id")
    .in("video_id", videoIds);

  const existingMap = new Map((existingVideos || []).map((v: any) => [v.video_id, v.id]));

  // Step 2: Separate into inserts and updates
  const toInsert: any[] = [];
  const toUpdate: { uuid: string; data: any }[] = [];

  for (const video of videos) {
    const videoData = {
      title: video.snippet.title,
      description: video.snippet.description,
      tags: video.snippet.tags || [],
      duration: video.contentDetails?.duration,
      duration_seconds: parseDuration(video.contentDetails?.duration || ""),
      language: video.snippet.defaultAudioLanguage,
      category_id: video.snippet.categoryId,
      thumbnail_url: video.snippet.thumbnails?.high?.url,
      has_captions: video.contentDetails?.caption === "true",
      is_licensed_content: video.contentDetails?.licensedContent || false,
      privacy_status: video.status?.privacyStatus,
    };

    const existingUuid = existingMap.get(video.id);
    if (existingUuid) {
      toUpdate.push({ uuid: existingUuid, data: { ...videoData, last_updated_at: new Date().toISOString() } });
    } else {
      toInsert.push({
        video_id: video.id,
        channel_id: channelId,
        published_at: video.snippet.publishedAt,
        first_seen_scan_id: scanId,
        ...videoData,
      });
    }
  }

  // Step 3: Batch insert new videos
  const uuidMap = new Map(existingMap); // video_id -> uuid
  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from("yt_vod_videos")
      .insert(toInsert)
      .select("id, video_id");

    if (insertErr) {
      console.error(`Batch insert error for ${toInsert.length} videos:`, insertErr);
      // Fall back to individual inserts for conflict handling
      for (const row of toInsert) {
        const { data: single, error: singleErr } = await supabase
          .from("yt_vod_videos")
          .upsert(row, { onConflict: "video_id" })
          .select("id, video_id")
          .single();
        if (single) uuidMap.set(single.video_id, single.id);
      }
    } else if (inserted) {
      for (const row of inserted) {
        uuidMap.set(row.video_id, row.id);
      }
    }
  }

  // Step 4: Batch update existing videos (one update call per video, but no select needed)
  for (const { uuid, data } of toUpdate) {
    await supabase.from("yt_vod_videos").update(data).eq("id", uuid);
  }

  // Step 5: Batch upsert metrics (uses unique constraint scan_id + video_id)
  const metricsRows: any[] = [];
  const videoStatusRows: any[] = [];

  for (const video of videos) {
    const videoUuid = uuidMap.get(video.id);
    if (!videoUuid) continue;

    metricsRows.push({
      video_id: videoUuid,
      scan_id: scanId,
      view_count: parseInt(video.statistics?.viewCount || "0"),
      like_count: video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : null,
      comment_count: video.statistics?.commentCount ? parseInt(video.statistics.commentCount) : null,
      favorite_count: video.statistics?.favoriteCount ? parseInt(video.statistics.favoriteCount) : null,
    });

    videoStatusRows.push({
      scan_id: scanId,
      video_id: video.id,
      channel_id: channelId,
      status: "success",
    });

    persisted++;
  }

  // Upsert metrics in one call (unique constraint: scan_id, video_id)
  if (metricsRows.length > 0) {
    const { error: metricsErr } = await supabase
      .from("yt_vod_metrics")
      .upsert(metricsRows, { onConflict: "scan_id,video_id" });
    if (metricsErr) console.error("Metrics upsert error:", metricsErr);
  }

  // Upsert video status in one call (unique constraint: scan_id, video_id)
  if (videoStatusRows.length > 0) {
    const { error: statusErr } = await supabase
      .from("yt_vod_scan_video_status")
      .upsert(videoStatusRows, { onConflict: "scan_id,video_id" });
    if (statusErr) console.error("Video status upsert error:", statusErr);
  }

  return persisted;
}

/**
 * Updates scan progress in the database.
 */
async function updateScanProgress(
  supabase: any,
  scanId: string,
  totalVideosRequested: number,
  totalVideosFetched: number,
  channelsSucceeded: number,
  channelsFailed: number,
  channelsPartial: number,
  keyManager: ApiKeyManager,
  lastProcessedIndex: number,
  completionReason: string | null = null,
  isComplete: boolean = false
) {
  await supabase.from("yt_vod_scans").update({
    total_videos_requested: totalVideosRequested,
    total_videos_fetched: totalVideosFetched,
    channels_succeeded: channelsSucceeded,
    channels_failed: channelsFailed,
    channels_partial: channelsPartial,
    api_keys_used: keyManager.getTotalKeyCount(),
    api_keys_exhausted: keyManager.getExhaustedCount(),
    is_complete: isComplete,
    completion_reason: completionReason,
    last_processed_channel_index: lastProcessedIndex,
  }).eq("id", scanId);
}

/**
 * Upserts a channel status row (idempotent via unique constraint).
 */
async function upsertChannelStatus(
  supabase: any,
  scanId: string,
  channelId: string,
  status: string,
  videosRequested: number,
  videosFetched: number,
  errorMessage: string | null,
  lastVideoPublishedAt: string | null,
) {
  await supabase.from("yt_vod_scan_channel_status").upsert({
    scan_id: scanId,
    channel_id: channelId,
    status,
    videos_requested: videosRequested,
    videos_fetched: videosFetched,
    error_message: errorMessage,
    last_video_published_at: lastVideoPublishedAt,
  }, { onConflict: "scan_id,channel_id" });
}

/**
 * Processes a single channel with batched persistence and mid-channel timeout checks.
 */
async function processChannel(
  supabase: any,
  keyManager: ApiKeyManager,
  channel: ChannelWithId,
  scanId: string,
  videosPerChannel: number,
  dailyCutoffDate: Date | null,
  scanStartTime: number
): Promise<{ videosFetched: number; allKeysExhausted: boolean; status: string; errorMessage: string | null; lastVideoPublishedAt: string | null }> {
  console.log(`Processing channel: ${channel.display_name}`);

  // Mark channel as processing immediately
  await upsertChannelStatus(supabase, scanId, channel.id, "processing", videosPerChannel, 0, null, null);

  // Get uploads playlist ID
  const { playlistId, error: playlistError, allKeysExhausted: keysExhausted1 } = 
    await getUploadsPlaylistId(keyManager, supabase, channel.id, channel.youtube_channel_id, channel.uploads_playlist_id);

  if (keysExhausted1) {
    await upsertChannelStatus(supabase, scanId, channel.id, "failed", videosPerChannel, 0, "Quota exhausted", null);
    return { videosFetched: 0, allKeysExhausted: true, status: "failed", errorMessage: "Quota exhausted", lastVideoPublishedAt: null };
  }

  if (!playlistId) {
    const msg = playlistError || "No uploads playlist";
    await upsertChannelStatus(supabase, scanId, channel.id, "failed", videosPerChannel, 0, msg, null);
    return { videosFetched: 0, allKeysExhausted: false, status: "failed", errorMessage: msg, lastVideoPublishedAt: null };
  }

  // Get video IDs from playlist
  const { videoIds, allKeysExhausted: keysExhausted2, lastPublishedAt, stoppedDueToOldContent } = 
    await getPlaylistVideoIds(keyManager, playlistId, videosPerChannel, dailyCutoffDate || undefined, scanStartTime);

  if (keysExhausted2 && videoIds.length === 0) {
    await upsertChannelStatus(supabase, scanId, channel.id, "failed", videosPerChannel, 0, "Quota exhausted during playlist fetch", null);
    return { videosFetched: 0, allKeysExhausted: true, status: "failed", errorMessage: "Quota exhausted during playlist fetch", lastVideoPublishedAt: null };
  }

  if (videoIds.length === 0) {
    const message = stoppedDueToOldContent ? "No videos in the last 48 hours" : "No videos found";
    await upsertChannelStatus(supabase, scanId, channel.id, "success", videosPerChannel, 0, message, null);
    return { videosFetched: 0, allKeysExhausted: false, status: "success", errorMessage: null, lastVideoPublishedAt: null };
  }

  console.log(`Found ${videoIds.length} videos for ${channel.display_name}`);

  // Fetch video details in API batches of 50, then persist in DB batches of VIDEO_BATCH_SIZE
  // with timeout checks between each DB batch
  let totalPersisted = 0;
  let allKeysExhausted = false;
  const apiBatchSize = 50;

  for (let apiOffset = 0; apiOffset < videoIds.length; apiOffset += apiBatchSize) {
    // Check timeout before each API batch
    if (isApproachingTimeout(scanStartTime)) {
      console.log(`Timeout approaching mid-channel (${channel.display_name}), persisted ${totalPersisted}/${videoIds.length} videos`);
      const status = totalPersisted > 0 ? "partial" : "failed";
      const msg = `Timeout after ${totalPersisted}/${videoIds.length} videos`;
      await upsertChannelStatus(supabase, scanId, channel.id, status, videosPerChannel, totalPersisted, msg, lastPublishedAt);
      return { videosFetched: totalPersisted, allKeysExhausted: false, status, errorMessage: msg, lastVideoPublishedAt: lastPublishedAt };
    }

    const apiBatch = videoIds.slice(apiOffset, apiOffset + apiBatchSize);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,statistics,status");
    url.searchParams.set("id", apiBatch.join(","));

    const { response, error, allKeysExhausted: keysExhausted } = await fetchWithRetry(url.toString(), keyManager);
    if (error || !response) {
      allKeysExhausted = keysExhausted;
      if (allKeysExhausted) break;
      continue;
    }

    const data = await response.json();
    const fetchedVideos: YouTubeVideoItem[] = data.items || [];

    // Persist in smaller DB batches with timeout checks
    for (let dbOffset = 0; dbOffset < fetchedVideos.length; dbOffset += VIDEO_BATCH_SIZE) {
      if (isApproachingTimeout(scanStartTime)) {
        console.log(`Timeout approaching during DB persist for ${channel.display_name}, saved ${totalPersisted} videos so far`);
        const status = totalPersisted > 0 ? "partial" : "failed";
        const msg = `Timeout during persistence after ${totalPersisted} videos`;
        await upsertChannelStatus(supabase, scanId, channel.id, status, videosPerChannel, totalPersisted, msg, lastPublishedAt);
        return { videosFetched: totalPersisted, allKeysExhausted: false, status, errorMessage: msg, lastVideoPublishedAt: lastPublishedAt };
      }

      const dbBatch = fetchedVideos.slice(dbOffset, dbOffset + VIDEO_BATCH_SIZE);
      const batchPersisted = await persistVideoBatch(supabase, dbBatch, channel.id, scanId);
      totalPersisted += batchPersisted;

      // Update channel progress after each DB batch
      await upsertChannelStatus(supabase, scanId, channel.id, "processing", videosPerChannel, totalPersisted, null, lastPublishedAt);
    }
  }

  // Final channel status
  let finalStatus: string;
  let errorMsg: string | null = null;

  if (totalPersisted === 0 && videoIds.length > 0) {
    finalStatus = "failed";
    errorMsg = "No videos fetched";
  } else if (totalPersisted < videoIds.length || allKeysExhausted) {
    finalStatus = "partial";
    errorMsg = `Fetched ${totalPersisted}/${videoIds.length} videos` + (allKeysExhausted ? " (quota exhausted)" : "");
  } else {
    finalStatus = "success";
  }

  await upsertChannelStatus(supabase, scanId, channel.id, finalStatus, videosPerChannel, totalPersisted, errorMsg, lastPublishedAt);

  return { videosFetched: totalPersisted, allKeysExhausted, status: finalStatus, errorMessage: errorMsg, lastVideoPublishedAt: lastPublishedAt };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const scanStartTime = Date.now();
  try {
    let scanType: "full" | "incremental" | "single_channel" | "daily" = "daily";
    let channelId: string | null = null;
    let dailyOnly = true;
    let resumeScanId: string | null = null;
    let videosPerChannel = 50;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        scanType = body.scanType || "daily";
        channelId = body.channelId || null;
        dailyOnly = body.dailyOnly !== false;
        resumeScanId = body.resumeScanId || null;
        
        if (dailyOnly) {
          // Hard cap: daily scans always use 50 videos/channel (not overridable)
          videosPerChannel = 50;
        } else {
          videosPerChannel = Math.min(body.videosPerChannel || 50, 500);
        }
        
        if (channelId) scanType = "single_channel";
      } catch { /* default to daily */ }
    }

    const dailyCutoffDate = dailyOnly ? new Date(Date.now() - 48 * 60 * 60 * 1000) : null;
    console.log(`VOD Scan: type=${scanType}, videos=${videosPerChannel}, dailyOnly=${dailyOnly}, resume=${resumeScanId || 'new'}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const keyManager = new ApiKeyManager(supabase);
    await keyManager.loadKeys();

    let scan: any;
    let startIndex = 0;
    let existingVideosFetched = 0;
    let existingVideosRequested = 0;
    let existingChannelsSucceeded = 0;
    let existingChannelsFailed = 0;
    let existingChannelsPartial = 0;

    if (resumeScanId) {
      const { data: existingScan, error: scanError } = await supabase
        .from("yt_vod_scans")
        .select("*")
        .eq("id", resumeScanId)
        .single();

      if (scanError || !existingScan) throw new Error(`Cannot resume scan ${resumeScanId}: not found`);
      if (existingScan.is_complete) {
        return new Response(
          JSON.stringify({ success: true, message: "Scan already complete", scanId: resumeScanId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      scan = existingScan;
      startIndex = existingScan.last_processed_channel_index || 0;
      existingVideosFetched = existingScan.total_videos_fetched || 0;
      existingVideosRequested = existingScan.total_videos_requested || 0;
      existingChannelsSucceeded = existingScan.channels_succeeded || 0;
      existingChannelsFailed = existingScan.channels_failed || 0;
      existingChannelsPartial = existingScan.channels_partial || 0;
      videosPerChannel = existingScan.videos_per_channel;
      console.log(`Resuming scan ${resumeScanId} from channel index ${startIndex}`);
    } else {
      const { data: newScan, error: scanError } = await supabase
        .from("yt_vod_scans")
        .insert({
          scan_type: scanType,
          videos_per_channel: videosPerChannel,
          date_range_start: dailyCutoffDate?.toISOString() || null,
          date_range_end: new Date().toISOString(),
          is_resumable: true,
          last_processed_channel_index: 0,
        })
        .select()
        .single();

      if (scanError) throw scanError;
      scan = newScan;
      console.log(`Created new VOD scan: ${scan.id}`);
    }

    // Get channels to scan
    let channelsQuery = supabase
      .from("yt_channels")
      .select("id, youtube_channel_id, display_name, uploads_playlist_id, network_group")
      .eq("is_active", true)
      .not("youtube_channel_id", "is", null);

    if (channelId) channelsQuery = channelsQuery.eq("id", channelId);

    const { data: channels, error: channelsError } = await channelsQuery;
    if (channelsError) throw channelsError;

    // Interleave TIMES and COMPETITION channels
    const rawChannels = channels as (ChannelWithId & { network_group?: string })[];
    const timesChannels = rawChannels.filter(c => c.network_group === 'TIMES');
    const competitionChannels = rawChannels.filter(c => c.network_group === 'COMPETITION');
    const otherChannels = rawChannels.filter(c => c.network_group !== 'TIMES' && c.network_group !== 'COMPETITION');

    const interleavedChannels: (ChannelWithId & { network_group?: string })[] = [];
    const maxLen = Math.max(timesChannels.length, competitionChannels.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < timesChannels.length) interleavedChannels.push(timesChannels[i]);
      if (i < competitionChannels.length) interleavedChannels.push(competitionChannels[i]);
    }
    interleavedChannels.push(...otherChannels);

    const validChannels = interleavedChannels;
    const totalChannels = validChannels.length;
    console.log(`Scanning ${totalChannels} channels (${timesChannels.length} TIMES, ${competitionChannels.length} COMPETITION, ${otherChannels.length} other), starting from index ${startIndex}`);

    // Pre-initialize all channel statuses as 'pending' for immediate UI feedback (only for new scans)
    if (!resumeScanId) {
      const pendingRows = validChannels.map(ch => ({
        scan_id: scan.id,
        channel_id: ch.id,
        status: "pending",
        videos_requested: videosPerChannel,
        videos_fetched: 0,
        error_message: null,
        last_video_published_at: null,
      }));

      // Insert in batches of 50 to avoid payload limits
      for (let i = 0; i < pendingRows.length; i += 50) {
        const batch = pendingRows.slice(i, i + 50);
        await supabase.from("yt_vod_scan_channel_status").upsert(batch, { onConflict: "scan_id,channel_id" });
      }
      console.log(`Initialized ${pendingRows.length} channel statuses as pending`);
    }

    let totalVideosRequested = existingVideosRequested;
    let totalVideosFetched = existingVideosFetched;
    let channelsSucceeded = existingChannelsSucceeded;
    let channelsFailed = existingChannelsFailed;
    let channelsPartial = existingChannelsPartial;
    let allKeysExhausted = false;
    let timedOut = false;
    let lastProcessedIndex = startIndex;

    for (let i = startIndex; i < validChannels.length; i++) {
      if (isApproachingTimeout(scanStartTime)) {
        console.log(`Timeout approaching at channel ${i}/${totalChannels}, saving progress`);
        timedOut = true;
        break;
      }

      if (allKeysExhausted) break;

      const channel = validChannels[i];
      console.log(`[${i + 1}/${totalChannels}] Processing: ${channel.display_name}`);
      totalVideosRequested += videosPerChannel;

      const result = await processChannel(
        supabase, keyManager, channel, scan.id,
        videosPerChannel, dailyCutoffDate, scanStartTime
      );

      totalVideosFetched += result.videosFetched;
      allKeysExhausted = result.allKeysExhausted;

      // Track channel outcomes
      if (result.status === "success") channelsSucceeded++;
      else if (result.status === "failed") channelsFailed++;
      else if (result.status === "partial") channelsPartial++;

      // If channel timed out mid-processing, advance past it so resume moves to next channel
      if (result.errorMessage?.includes("Timeout")) {
        timedOut = true;
        lastProcessedIndex = i + 1; // Advance past timed-out channel
        await updateScanProgress(supabase, scan.id, totalVideosRequested, totalVideosFetched,
          channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex);
        console.log(`Channel ${channel.display_name} timed out mid-processing, advancing to next channel on resume`);
        break;
      }

      lastProcessedIndex = i + 1;
      await updateScanProgress(supabase, scan.id, totalVideosRequested, totalVideosFetched,
        channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex);
      console.log(`Progress: ${lastProcessedIndex}/${totalChannels} channels, ${totalVideosFetched} videos`);
    }

    const isFullyComplete = lastProcessedIndex >= validChannels.length && !allKeysExhausted;

    // Aggregate keyword and tag stats only if fully complete
    if (isFullyComplete && !isApproachingTimeout(scanStartTime) && totalVideosFetched > 0) {
      console.log("Aggregating keyword and tag statistics...");
      
      const { data: scanVideos } = await supabase
        .from("yt_vod_videos")
        .select("id, title, tags")
        .in("channel_id", validChannels.map(c => c.id));

      const { data: scanMetrics } = await supabase
        .from("yt_vod_metrics")
        .select("video_id, view_count, like_count")
        .eq("scan_id", scan.id);

      const metricsMap = new Map((scanMetrics || []).map((m: any) => [m.video_id, m]));

      const keywordStats: Map<string, { count: number; totalViews: bigint; totalLikes: bigint }> = new Map();
      const tagStats: Map<string, { count: number; totalViews: bigint; totalLikes: bigint }> = new Map();

      for (const video of scanVideos || []) {
        const metrics = metricsMap.get(video.id);
        const views = BigInt(metrics?.view_count || 0);
        const likes = BigInt(metrics?.like_count || 0);

        for (const keyword of extractKeywords(video.title)) {
          const current = keywordStats.get(keyword) || { count: 0, totalViews: BigInt(0), totalLikes: BigInt(0) };
          current.count += 1;
          current.totalViews += views;
          current.totalLikes += likes;
          keywordStats.set(keyword, current);
        }

        for (const tag of extractTags(video.title, video.tags || [])) {
          const current = tagStats.get(tag) || { count: 0, totalViews: BigInt(0), totalLikes: BigInt(0) };
          current.count += 1;
          current.totalViews += views;
          current.totalLikes += likes;
          tagStats.set(tag, current);
        }
      }

      const keywordStatsToInsert = Array.from(keywordStats.entries())
        .filter(([_, stats]) => stats.count >= 2)
        .map(([keyword, stats]) => ({
          scan_id: scan.id, keyword,
          usage_count: stats.count,
          total_views: Number(stats.totalViews),
          avg_views: stats.count > 0 ? Number(stats.totalViews / BigInt(stats.count)) : 0,
          total_likes: Number(stats.totalLikes),
          avg_likes: stats.count > 0 ? Number(stats.totalLikes / BigInt(stats.count)) : 0,
          avg_engagement_rate: Number(stats.totalViews) > 0 ? Number(stats.totalLikes) / Number(stats.totalViews) : 0,
        }));

      if (keywordStatsToInsert.length > 0) {
        await supabase.from("yt_vod_keyword_stats").insert(keywordStatsToInsert);
      }

      const tagStatsToInsert = Array.from(tagStats.entries())
        .filter(([_, stats]) => stats.count >= 2)
        .map(([tag, stats]) => ({
          scan_id: scan.id, tag,
          usage_count: stats.count,
          total_views: Number(stats.totalViews),
          avg_views: stats.count > 0 ? Number(stats.totalViews / BigInt(stats.count)) : 0,
          total_likes: Number(stats.totalLikes),
          avg_engagement_rate: Number(stats.totalViews) > 0 ? Number(stats.totalLikes) / Number(stats.totalViews) : 0,
        }));

      if (tagStatsToInsert.length > 0) {
        await supabase.from("yt_vod_tag_stats").insert(tagStatsToInsert);
      }
    }

    let completionReason = "success";
    if (timedOut) completionReason = "timeout";
    else if (allKeysExhausted) completionReason = "quota_exhausted";

    await updateScanProgress(supabase, scan.id, totalVideosRequested, totalVideosFetched,
      channelsSucceeded, channelsFailed, channelsPartial, keyManager, lastProcessedIndex,
      completionReason, isFullyComplete);

    keyManager.logUsageStats();

    const channelsRemaining = totalChannels - lastProcessedIndex;
    console.log(`VOD scan ${isFullyComplete ? 'completed' : 'paused'}: ${totalVideosFetched} videos, ${lastProcessedIndex}/${totalChannels} channels, reason: ${completionReason}`);

    return new Response(
      JSON.stringify({
        success: true,
        scanId: scan.id,
        scanType,
        isComplete: isFullyComplete,
        completionReason,
        canResume: !isFullyComplete && !allKeysExhausted,
        summary: {
          channelsTotal: totalChannels,
          channelsProcessed: lastProcessedIndex,
          channelsRemaining,
          channelsSucceeded,
          channelsFailed,
          channelsPartial,
          videosRequested: totalVideosRequested,
          videosFetched: totalVideosFetched,
          apiKeysUsed: keyManager.getTotalKeyCount(),
          apiKeysExhausted: keyManager.getExhaustedCount(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("VOD Scan error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
