import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  "india", "indian",
]);

const TIMEOUT_MS = 50000; // 50 seconds, leaving 10s buffer before platform kills at 60s

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    liveBroadcastContent: string;
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    tags?: string[];
    defaultAudioLanguage?: string;
  };
  liveStreamingDetails?: {
    concurrentViewers?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
}

interface ChannelWithId {
  id: string;
  youtube_channel_id: string;
  display_name: string;
}

interface ChannelRow {
  id: string;
  youtube_channel_id: string | null;
  youtube_url: string;
  display_name: string;
}

interface ApiKeyInfo {
  id: string;
  api_key: string;
  name: string;
}

// Error type categorization
type ErrorType = "quota" | "invalid" | "rate_limit" | "network" | "forbidden" | "other";

function categorizeError(status: number, errorText: string): ErrorType {
  if (status === 403 && errorText.includes("quotaExceeded")) return "quota";
  if (status === 403) return "forbidden";
  if (status === 400 || status === 401) return "invalid";
  if (status === 429) return "rate_limit";
  if (status === 0 || errorText.includes("network") || errorText.includes("fetch")) return "network";
  return "other";
}

function isApproachingTimeout(scanStartTime: number): boolean {
  return Date.now() - scanStartTime > TIMEOUT_MS;
}

// API Key Manager for rotation with round-robin load balancing
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
      console.log(`Loaded ${this.keys.length} API keys from database: ${this.keys.map(k => k.name).join(", ")}`);
    } else {
      const envKey = Deno.env.get("YOUTUBE_API_KEY");
      if (envKey) {
        this.keys = [{ id: "env", api_key: envKey, name: "Environment Key" }];
        console.log("Using API key from environment variable");
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
    const currentCount = this.keyUsageCount.get(selectedKey.id) || 0;
    this.keyUsageCount.set(selectedKey.id, currentCount + 1);

    return selectedKey;
  }

  async markKeyExhausted(keyId: string, errorType: ErrorType, errorMessage: string): Promise<void> {
    this.exhaustedKeys.add(keyId);
    this.keyErrors.set(keyId, { errorType, message: errorMessage });
    console.log(`API key ${keyId} exhausted with error type: ${errorType}`);

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
      await this.supabase
        .from("yt_api_keys")
        .update({
          last_error: null,
          last_error_at: null,
          error_type: null,
          consecutive_errors: 0,
        })
        .eq("id", keyId);
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

  getKeyErrors(): Map<string, { errorType: ErrorType; message: string }> {
    return this.keyErrors;
  }

  getExhaustedCount(): number {
    return this.exhaustedKeys.size;
  }

  getTotalKeyCount(): number {
    return this.keys.length;
  }

  logUsageStats(): void {
    console.log("=== API Key Usage Statistics ===");
    this.keys.forEach(key => {
      const count = this.keyUsageCount.get(key.id) || 0;
      const error = this.keyErrors.get(key.id);
      const status = error ? ` (${error.errorType.toUpperCase()}: ${error.message.slice(0, 50)})` : "";
      console.log(`  ${key.name}: ${count} requests${status}`);
    });
    console.log(`  Total requests: ${this.requestCounter}`);
    console.log(`  Keys exhausted: ${this.exhaustedKeys.size}/${this.keys.length}`);
    console.log("================================");
  }
}

async function writeChannelStatus(
  supabase: any,
  scanId: string,
  channelId: string,
  status: string,
  streamsFound: number,
  errorMessage: string | null
): Promise<void> {
  // Upsert: update if exists, insert if not
  const { error } = await supabase
    .from("yt_scan_channel_status")
    .update({ status, streams_found: streamsFound, error_message: errorMessage })
    .eq("scan_id", scanId)
    .eq("channel_id", channelId);
  
  if (error) {
    console.error(`Error updating channel status for ${channelId}:`, error);
  }
}

async function fetchWithRetry(
  url: string,
  keyManager: ApiKeyManager,
  maxRetries = 3
): Promise<{ response: Response | null; error: string | null }> {
  let lastError: string | null = null;
  let networkRetries = 0;
  const maxNetworkRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyInfo = keyManager.getCurrentKeyInfo();
    if (!keyInfo) {
      return { response: null, error: "All API keys exhausted" };
    }

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.set("key", keyInfo.api_key);

    try {
      const response = await fetch(urlWithKey.toString());

      if (response.ok) {
        await keyManager.updateLastUsed(keyInfo.id);
        await keyManager.clearKeyError(keyInfo.id);
        return { response, error: null };
      }

      const errorText = await response.text();
      const errorType = categorizeError(response.status, errorText);

      if (errorType === "quota" || errorType === "invalid" || errorType === "forbidden") {
        await keyManager.markKeyExhausted(keyInfo.id, errorType, `${response.status}: ${errorText.slice(0, 200)}`);

        if (keyManager.hasAvailableKeys()) {
          continue;
        } else {
          return { response: null, error: `All API keys exhausted. Last error: ${errorType}` };
        }
      }

      if (errorType === "rate_limit") {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`Rate limited on key ${keyInfo.name}, waiting ${backoffMs}ms before retry...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      lastError = `YouTube API error: ${response.status} - ${errorText.slice(0, 200)}`;
    } catch (networkError) {
      const errorMessage = networkError instanceof Error ? networkError.message : "Network error";
      networkRetries++;
      
      if (networkRetries < maxNetworkRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, networkRetries - 1), 4000);
        console.log(`Network error on key ${keyInfo.name}: ${errorMessage}. Retry ${networkRetries}/${maxNetworkRetries} after ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        attempt--;
        continue;
      }
      
      console.log(`Network error persists after ${maxNetworkRetries} retries, marking key as temporarily unavailable`);
      await keyManager.markKeyExhausted(keyInfo.id, "network", errorMessage);
      lastError = `Network error: ${errorMessage}`;
      networkRetries = 0;

      if (keyManager.hasAvailableKeys()) {
        continue;
      }
    }
  }

  return { response: null, error: lastError || "Failed to fetch from YouTube API" };
}

async function searchLiveStreams(
  keyManager: ApiKeyManager,
  channelId: string,
  dbChannelId: string,
  supabase: any,
  scanId: string,
  scanStartTime: number
): Promise<{ streams: YouTubeSearchItem[]; timedOut: boolean }> {
  console.log(`Searching live streams for channel: ${channelId}`);

  let allItems: YouTubeSearchItem[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  const maxPages = 5;
  let lastError: string | null = null;
  let timedOut = false;

  try {
    do {
      if (isApproachingTimeout(scanStartTime)) {
        console.log(`Timeout approaching during search for channel ${channelId}`);
        timedOut = true;
        break;
      }

      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("channelId", channelId);
      url.searchParams.set("eventType", "live");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "50");

      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const { response, error } = await fetchWithRetry(url.toString(), keyManager);

      if (error) {
        lastError = error;
        break;
      }

      if (!response) {
        lastError = "No response received";
        break;
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        allItems = allItems.concat(data.items);
      }

      nextPageToken = data.nextPageToken || null;
      pageCount++;

      if (nextPageToken) {
        console.log(`Channel ${channelId}: fetching page ${pageCount + 1}...`);
      }
    } while (nextPageToken && pageCount < maxPages);

    // Write status progressively
    if (timedOut) {
      if (allItems.length > 0) {
        await writeChannelStatus(supabase, scanId, dbChannelId, "partial", allItems.length, "Timed out during search");
      } else {
        await writeChannelStatus(supabase, scanId, dbChannelId, "partial", 0, "Timed out before search completed");
      }
    } else if (lastError) {
      if (allItems.length > 0) {
        await writeChannelStatus(supabase, scanId, dbChannelId, "partial", allItems.length, lastError);
      } else {
        await writeChannelStatus(supabase, scanId, dbChannelId, "failed", 0, lastError);
      }
    } else {
      await writeChannelStatus(supabase, scanId, dbChannelId, "success", allItems.length, null);
    }

    console.log(`Found ${allItems.length} live streams for channel ${channelId}`);
    return { streams: allItems, timedOut };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error searching channel ${channelId}:`, error);
    
    await writeChannelStatus(supabase, scanId, dbChannelId, allItems.length > 0 ? "partial" : "failed", allItems.length, errorMessage);
    
    return { streams: allItems, timedOut: false };
  }
}

async function getVideoDetails(keyManager: ApiKeyManager, videoIds: string[], scanStartTime: number): Promise<YouTubeVideoItem[]> {
  if (videoIds.length === 0) return [];

  const batchSize = 50;
  const allResults: YouTubeVideoItem[] = [];

  for (let i = 0; i < videoIds.length; i += batchSize) {
    if (isApproachingTimeout(scanStartTime)) {
      console.log(`Timeout approaching during video detail fetch, returning ${allResults.length} videos so far`);
      break;
    }

    const batch = videoIds.slice(i, i + batchSize);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,liveStreamingDetails,statistics");
    url.searchParams.set("id", batch.join(","));

    try {
      const { response, error } = await fetchWithRetry(url.toString(), keyManager);
      
      if (error || !response) {
        console.error("Error fetching video details:", error);
        continue;
      }
      
      const data = await response.json();
      if (data.items) {
        allResults.push(...data.items);
      }
    } catch (error) {
      console.error("Error fetching video details:", error);
    }
  }

  console.log(`Fetched details for ${allResults.length}/${videoIds.length} videos`);
  return allResults;
}

async function resolveChannelIdFromUrl(keyManager: ApiKeyManager, youtubeUrl: string): Promise<string | null> {
  try {
    const url = new URL(youtubeUrl);
    const pathname = url.pathname;

    if (pathname.startsWith("/channel/")) {
      const channelId = pathname.split("/")[2];
      if (channelId?.startsWith("UC")) {
        return channelId;
      }
    }

    let identifier: string | null = null;
    let searchType: "forHandle" | "forUsername" = "forHandle";

    if (pathname.startsWith("/@")) {
      identifier = pathname.substring(2).split("/")[0];
      searchType = "forHandle";
    } else if (pathname.startsWith("/c/")) {
      identifier = pathname.split("/")[2];
      searchType = "forHandle";
    } else if (pathname.startsWith("/user/")) {
      identifier = pathname.split("/")[2];
      searchType = "forUsername";
    }

    if (!identifier) {
      console.log(`Could not parse channel URL: ${youtubeUrl}`);
      return null;
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    apiUrl.searchParams.set("part", "id");
    apiUrl.searchParams.set(searchType, identifier);

    const { response, error } = await fetchWithRetry(apiUrl.toString(), keyManager);
    
    if (error || !response) {
      console.error(`Error resolving channel: ${error}`);
      return null;
    }
    
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }

    if (searchType === "forHandle") {
      apiUrl.searchParams.delete("forHandle");
      apiUrl.searchParams.set("forUsername", identifier);

      const { response: response2, error: error2 } = await fetchWithRetry(apiUrl.toString(), keyManager);
      
      if (error2 || !response2) {
        return null;
      }
      
      const data2 = await response2.json();

      if (data2.items && data2.items.length > 0) {
        return data2.items[0].id;
      }
    }

    console.log(`Could not resolve channel ID for: ${youtubeUrl}`);
    return null;
  } catch (error) {
    console.error(`Error resolving channel ID for ${youtubeUrl}:`, error);
    return null;
  }
}

function extractKeywords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !word.startsWith("#"));

  return [...new Set(words)];
}

function extractTags(title: string, tags: string[] = []): string[] {
  const hashtagRegex = /#[\w]+/g;
  const titleHashtags = (title.match(hashtagRegex) || []).map((t) => t.toLowerCase());

  const processedTags = tags
    .filter((t) => t.length < 30)
    .map((t) => (t.startsWith("#") ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, "")}`));

  return [...new Set([...titleHashtags, ...processedTags])];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const scanStartTime = Date.now();

  try {
    let channelIdToRefresh: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        channelIdToRefresh = body.channelId || null;
      } catch {
        // No body or invalid JSON, proceed with full scan
      }
    }

    const isSingleChannelRefresh = !!channelIdToRefresh;
    console.log(isSingleChannelRefresh 
      ? `Starting single channel refresh for: ${channelIdToRefresh}` 
      : "Starting YouTube Live scan...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const keyManager = new ApiKeyManager(supabase);
    await keyManager.loadKeys();

    let scan: { id: string; created_at: string };
    
    if (isSingleChannelRefresh) {
      const { data: latestScan, error: latestError } = await supabase
        .from("yt_scans")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (latestError || !latestScan) {
        throw new Error("No existing scan found to update");
      }
      scan = latestScan;
      console.log(`Updating existing scan: ${scan.id}`);
    } else {
      const { data: newScan, error: scanError } = await supabase
        .from("yt_scans")
        .insert({ notes: "Automated scan" })
        .select()
        .single();

      if (scanError) {
        console.error("Error creating scan:", scanError);
        throw scanError;
      }
      scan = newScan;
      console.log(`Created scan: ${scan.id}`);
    }

    // Get channels to scan
    let channelsQuery = supabase
      .from("yt_channels")
      .select("*")
      .eq("is_active", true);
    
    if (isSingleChannelRefresh) {
      channelsQuery = channelsQuery.eq("id", channelIdToRefresh);
    }
    
    const { data: channels, error: channelsError } = await channelsQuery;

    if (channelsError) {
      console.error("Error fetching channels:", channelsError);
      throw channelsError;
    }

    console.log(`Found ${channels.length} active channels`);

    // Insert PENDING status for all channels upfront so the UI can show total immediately
    if (!isSingleChannelRefresh) {
      const pendingStatuses = channels.map((c: any) => ({
        scan_id: scan.id,
        channel_id: c.id,
        status: "pending",
        streams_found: 0,
        error_message: null,
      }));
      
      if (pendingStatuses.length > 0) {
        const { error: pendingError } = await supabase.from("yt_scan_channel_status").insert(pendingStatuses);
        if (pendingError) {
          console.error("Error inserting pending statuses:", pendingError);
        }
      }
    }

    // Resolve and cache channel IDs for channels that don't have them
    const channelsWithoutIds = channels.filter((c: any) => !c.youtube_channel_id) as ChannelRow[];
    const channelsWithIds = channels.filter((c: any) => c.youtube_channel_id) as ChannelWithId[];

    console.log(`Channels needing ID resolution: ${channelsWithoutIds.length}`);

    let timedOutDuringResolution = false;

    // Resolve missing channel IDs
    const resolutionBatchSize = 5;
    for (let i = 0; i < channelsWithoutIds.length; i += resolutionBatchSize) {
      if (isApproachingTimeout(scanStartTime)) {
        console.log("Timeout approaching during channel ID resolution");
        timedOutDuringResolution = true;
        // Mark remaining unresolved channels as failed
        for (let j = i; j < channelsWithoutIds.length; j++) {
          await writeChannelStatus(supabase, scan.id, channelsWithoutIds[j].id, "failed", 0, "Timed out before resolution");
        }
        break;
      }

      const batch = channelsWithoutIds.slice(i, i + resolutionBatchSize);
      const resolutions = await Promise.all(
        batch.map(async (channel) => {
          const resolvedId = await resolveChannelIdFromUrl(keyManager, channel.youtube_url);
          return { channel, resolvedId };
        }),
      );

      for (const { channel, resolvedId } of resolutions) {
        if (resolvedId) {
          console.log(`Resolved ${channel.display_name}: ${resolvedId}`);
          await supabase.from("yt_channels").update({ youtube_channel_id: resolvedId }).eq("id", channel.id);
          channelsWithIds.push({
            id: channel.id,
            youtube_channel_id: resolvedId,
            display_name: channel.display_name,
          });
        } else {
          console.log(`Failed to resolve: ${channel.display_name} (${channel.youtube_url})`);
          await writeChannelStatus(supabase, scan.id, channel.id, "failed", 0, "Failed to resolve channel ID");
        }
      }
    }

    if (timedOutDuringResolution) {
      keyManager.logUsageStats();
      return new Response(
        JSON.stringify({
          success: true,
          scanId: scan.id,
          channelsScanned: channels.length,
          liveStreamsFound: 0,
          completionReason: "timeout",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validChannels = channelsWithIds;
    console.log(`Total channels with valid IDs: ${validChannels.length}`);

    // Search channels with progressive status writes and timeout checks
    const batchSize = 10;
    const searchResults: { channel: ChannelWithId; streams: YouTubeSearchItem[] }[] = [];
    let timedOutDuringSearch = false;

    for (let i = 0; i < validChannels.length; i += batchSize) {
      if (isApproachingTimeout(scanStartTime)) {
        console.log("Timeout approaching before channel search batch");
        timedOutDuringSearch = true;
        // Mark remaining channels as pending (they already are from init)
        break;
      }

      const batch = validChannels.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (channel) => {
          const { streams, timedOut } = await searchLiveStreams(
            keyManager, channel.youtube_channel_id, channel.id,
            supabase, scan.id, scanStartTime
          );
          if (timedOut) timedOutDuringSearch = true;
          return { channel, streams };
        }),
      );
      searchResults.push(...batchResults);

      if (timedOutDuringSearch) break;
    }

    // Collect all video IDs and map to channels
    const allVideoIds: string[] = [];
    const videoToChannel: Map<string, ChannelWithId> = new Map();

    for (const { channel, streams } of searchResults) {
      for (const stream of streams) {
        allVideoIds.push(stream.id.videoId);
        videoToChannel.set(stream.id.videoId, channel);
      }
    }

    console.log(`Total live streams found: ${allVideoIds.length}`);

    if (allVideoIds.length === 0) {
      console.log("No live streams found");
      keyManager.logUsageStats();
      
      return new Response(
        JSON.stringify({
          success: true,
          scanId: scan.id,
          channelsScanned: channels.length,
          liveStreamsFound: 0,
          completionReason: timedOutDuringSearch ? "timeout" : "complete",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get detailed stats for all live videos (with timeout support)
    const videoDetails = await getVideoDetails(keyManager, allVideoIds, scanStartTime);
    
    console.log(`Got details for ${videoDetails.length} videos`);

    // Get existing streams to check for upserts
    const { data: existingStreams } = await supabase
      .from("yt_streams")
      .select("id, video_id")
      .in("video_id", allVideoIds);

    const existingStreamMap = new Map((existingStreams || []).map((s: any) => [s.video_id, s.id]));

    // Prepare batch data
    const newStreams: any[] = [];
    const streamUpdates: { id: string; data: any }[] = [];
    const metricsToInsert: any[] = [];
    const channelMetrics: Map<string, { totalConcurrent: number; highestConcurrent: number; streamCount: number }> = new Map();
    const keywordStats: Map<string, { count: number; totalViewers: number }> = new Map();
    const tagStats: Map<string, { count: number; totalViewers: number }> = new Map();

    for (const video of videoDetails) {
      const channel = videoToChannel.get(video.id);
      if (!channel) continue;

      const concurrentViewers = parseInt(video.liveStreamingDetails?.concurrentViewers || "0");
      const viewCount = video.statistics?.viewCount ? parseInt(video.statistics.viewCount) : null;
      const likeCount = video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : null;

      const existingStreamId = existingStreamMap.get(video.id);

      if (existingStreamId) {
        streamUpdates.push({
          id: existingStreamId,
          data: {
            title: video.snippet.title,
            description: video.snippet.description,
            tags: video.snippet.tags || [],
            language: video.snippet.defaultAudioLanguage,
          },
        });

        metricsToInsert.push({
          scan_id: scan.id,
          stream_id: existingStreamId,
          concurrent_viewers: concurrentViewers,
          view_count: viewCount,
          like_count: likeCount,
          is_live: true,
        });
      } else {
        newStreams.push({
          video_id: video.id,
          channel_id: channel.id,
          title: video.snippet.title,
          description: video.snippet.description,
          first_seen_scan_id: scan.id,
          tags: video.snippet.tags || [],
          language: video.snippet.defaultAudioLanguage,
          _concurrent_viewers: concurrentViewers,
          _view_count: viewCount,
          _like_count: likeCount,
        });
      }

      const currentMetrics = channelMetrics.get(channel.id) || { totalConcurrent: 0, highestConcurrent: 0, streamCount: 0 };
      currentMetrics.totalConcurrent += concurrentViewers;
      currentMetrics.highestConcurrent = Math.max(currentMetrics.highestConcurrent, concurrentViewers);
      currentMetrics.streamCount += 1;
      channelMetrics.set(channel.id, currentMetrics);

      const keywords = extractKeywords(video.snippet.title);
      for (const keyword of keywords) {
        const current = keywordStats.get(keyword) || { count: 0, totalViewers: 0 };
        current.count += 1;
        current.totalViewers += concurrentViewers;
        keywordStats.set(keyword, current);
      }

      const tags = extractTags(video.snippet.title, video.snippet.tags);
      for (const tag of tags) {
        const current = tagStats.get(tag) || { count: 0, totalViewers: 0 };
        current.count += 1;
        current.totalViewers += concurrentViewers;
        tagStats.set(tag, current);
      }
    }

    // BATCH: Insert new streams
    if (newStreams.length > 0) {
      const streamsToInsert = newStreams.map(({ _concurrent_viewers, _view_count, _like_count, ...stream }) => stream);

      const { data: insertedStreams, error: insertError } = await supabase
        .from("yt_streams")
        .insert(streamsToInsert)
        .select("id, video_id");

      if (insertError) {
        console.error("Error batch inserting streams:", insertError);
      } else if (insertedStreams) {
        for (const inserted of insertedStreams) {
          const original = newStreams.find((s) => s.video_id === inserted.video_id);
          if (original) {
            metricsToInsert.push({
              scan_id: scan.id,
              stream_id: inserted.id,
              concurrent_viewers: original._concurrent_viewers,
              view_count: original._view_count,
              like_count: original._like_count,
              is_live: true,
            });
          }
        }
      }
    }

    // BATCH: Update existing streams
    if (streamUpdates.length > 0) {
      await Promise.all(streamUpdates.map(({ id, data }) => supabase.from("yt_streams").update(data).eq("id", id)));
    }

    // BATCH: Insert all metrics
    console.log(`Preparing to insert ${metricsToInsert.length} metrics`);
    if (metricsToInsert.length > 0) {
      const { data: insertedMetrics, error: metricsError } = await supabase
        .from("yt_stream_scan_metrics")
        .insert(metricsToInsert)
        .select("id");
        
      if (metricsError) {
        console.error("Error batch inserting metrics:", metricsError);
      } else {
        console.log(`Successfully inserted ${insertedMetrics?.length || 0} metrics`);
      }
    }

    // BATCH: Insert channel summaries
    const channelSummaries = Array.from(channelMetrics.entries()).map(([channelId, metrics]) => ({
      scan_id: scan.id,
      channel_id: channelId,
      total_concurrent_views: metrics.totalConcurrent,
      highest_concurrent: metrics.highestConcurrent,
      number_of_streams: metrics.streamCount,
      average_peak_per_stream: metrics.streamCount > 0 ? Math.round(metrics.totalConcurrent / metrics.streamCount) : 0,
    }));

    if (channelSummaries.length > 0) {
      const { error: summaryError } = await supabase.from("yt_scan_channel_summary").insert(channelSummaries);
      if (summaryError) {
        console.error("Error batch inserting channel summaries:", summaryError);
      }
    }

    // BATCH: Insert keyword stats
    const keywordStatsToInsert = Array.from(keywordStats.entries()).map(([keyword, stats]) => ({
      scan_id: scan.id,
      keyword: keyword,
      usage_count: stats.count,
      total_concurrent_views: stats.totalViewers,
      avg_concurrent_views: Math.round(stats.totalViewers / stats.count),
    }));

    if (keywordStatsToInsert.length > 0) {
      const { error: keywordError } = await supabase.from("yt_scan_keyword_stats").insert(keywordStatsToInsert);
      if (keywordError) {
        console.error("Error batch inserting keyword stats:", keywordError);
      }
    }

    // BATCH: Insert tag stats
    const tagStatsToInsert = Array.from(tagStats.entries()).map(([tag, stats]) => ({
      scan_id: scan.id,
      tag: tag,
      usage_count: stats.count,
      total_concurrent_views: stats.totalViewers,
      avg_concurrent_views: Math.round(stats.totalViewers / stats.count),
    }));

    if (tagStatsToInsert.length > 0) {
      const { error: tagError } = await supabase.from("yt_scan_tag_stats").insert(tagStatsToInsert);
      if (tagError) {
        console.error("Error batch inserting tag stats:", tagError);
      }
    }

    keyManager.logUsageStats();
    console.log("Scan completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        scanId: scan.id,
        channelsScanned: channels.length,
        liveStreamsFound: videoDetails.length,
        completionReason: timedOutDuringSearch ? "timeout" : "complete",
        apiKeysUsed: keyManager.getTotalKeyCount(),
        apiKeysExhausted: keyManager.getExhaustedCount(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Scan error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
