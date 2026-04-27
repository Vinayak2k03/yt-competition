/**
 * Shared TypeScript types for YouTube Live Radar application.
 * 
 * This file contains all the common type definitions used across
 * the live stream scanning and VOD analysis features.
 */

// =============================================================================
// CHANNEL TYPES
// =============================================================================

/** Network group identifier - distinguishes Times Network from competitors */
export type NetworkGroup = 'TIMES' | 'COMPETITION';

/** Base channel information from yt_channels table */
export interface Channel {
  id: string;
  display_name: string;
  youtube_url: string;
  youtube_channel_id: string | null;
  network_group: NetworkGroup;
  brand_cluster: string;
  is_active: boolean;
  created_at: string;
}

/** Verified channel data from YouTube API */
export interface VerifiedChannel {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  customUrl?: string;
}

// =============================================================================
// LIVE STREAM SCAN TYPES
// =============================================================================

/** Live stream scan metadata */
export interface LiveScan {
  id: string;
  created_at: string;
  notes: string | null;
  hasNewerFailedScans?: boolean;
  failedScanCount?: number;
  streamCount?: number;
}

/** Channel-level aggregated live stream metrics */
export interface LiveChannelOverview {
  channelId: string;
  channelName: string;
  networkGroup: NetworkGroup;
  brandCluster: string;
  totalConcurrentViews: number;
  highestConcurrent: number;
  numberOfStreams: number;
  averagePeakPerStream: number;
  lastSuccessfulScan: string | null;
  isStaleData?: boolean;
}

/** Individual live stream details with metrics */
export interface LiveStream {
  streamTitle: string;
  videoId: string;
  channelName: string;
  networkGroup: NetworkGroup;
  brandCluster: string;
  concurrentViewers: number;
  viewCount: number | null;
  likeCount: number | null;
  isLive: boolean;
  firstSeenAt: string | null;
}

/** Keyword statistics from live stream titles */
export interface LiveKeywordStat {
  keyword: string;
  usageCount: number;
  avgConcurrentViews: number;
  totalConcurrentViews: number;
}

/** Tag/hashtag statistics from live streams */
export interface LiveTagStat {
  tag: string;
  usageCount: number;
  avgConcurrentViews: number;
  totalConcurrentViews: number;
}

/** Scan health status for monitoring */
export interface LiveScanHealth {
  scanId: string;
  channelsSucceeded: number;
  channelsFailed: number;
  channelsPartial: number;
  channels: {
    channelId: string;
    channelName: string;
    status: 'success' | 'failed' | 'partial';
    streamsFound: number;
    errorMessage: string | null;
  }[];
}

// =============================================================================
// VOD SCAN TYPES
// =============================================================================

/** VOD scan metadata with completion tracking */
export interface VODScan {
  id: string;
  created_at: string;
  scan_type: 'full' | 'incremental' | 'daily' | 'single_channel';
  videos_per_channel: number;
  total_videos_requested: number;
  total_videos_fetched: number;
  channels_succeeded: number;
  channels_failed: number;
  channels_partial: number;
  api_keys_used: number;
  api_keys_exhausted: number;
  is_complete: boolean;
  completion_reason: 'completed' | 'quota_exhausted' | 'timeout' | null;
  videoCount?: number;
  /** Index of last processed channel for resumable scans */
  last_processed_channel_index?: number;
  /** Whether this scan can be resumed */
  is_resumable?: boolean;
}

/** Channel-level VOD performance summary */
export interface VODChannelOverview {
  channelId: string;
  channelName: string;
  networkGroup: NetworkGroup;
  brandCluster: string;
  status: 'success' | 'failed' | 'partial' | 'pending';
  videosRequested: number;
  videosFetched: number;
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  avgViews: number;
  engagementRate: number;
  errorMessage: string | null;
}

/** Individual VOD video with metrics */
export interface VODVideo {
  id: string;
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  networkGroup: NetworkGroup;
  brandCluster: string;
  publishedAt: string;
  duration: string;
  durationSeconds: number;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  tags: string[];
  language: string | null;
  hasCaptions: boolean;
}

/** Paginated VOD videos response */
export interface VODVideosResponse {
  videos: VODVideo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** VOD keyword statistics */
export interface VODKeywordStat {
  keyword: string;
  usageCount: number;
  totalViews: number;
  avgViews: number;
  totalLikes: number;
  avgLikes: number;
  avgEngagementRate: number;
}

/** VOD tag statistics */
export interface VODTagStat {
  tag: string;
  usageCount: number;
  totalViews: number;
  avgViews: number;
  totalLikes: number;
  avgEngagementRate: number;
}

/** VOD scan health with detailed channel status */
export interface VODScanHealth {
  scan: {
    id: string;
    createdAt: string;
    scanType: string;
    isComplete: boolean;
    completionReason: string | null;
    totalVideosRequested: number;
    totalVideosFetched: number;
    channelsSucceeded: number;
    channelsFailed: number;
    channelsPartial: number;
    apiKeysUsed: number;
    apiKeysExhausted: number;
  };
  channels: {
    channelId: string;
    channelName: string;
    status: string;
    videosRequested: number;
    videosFetched: number;
    errorMessage: string | null;
  }[];
}

// =============================================================================
// API KEY TYPES
// =============================================================================

/** API key status and error tracking */
export interface ApiKey {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  quota_exceeded_at: string | null;
  last_used_at: string | null;
  created_at: string;
  last_error: string | null;
  last_error_at: string | null;
  error_type: ApiKeyErrorType | null;
  consecutive_errors: number;
}

/** Types of errors that can occur with API keys */
export type ApiKeyErrorType = 'quota' | 'invalid' | 'rate_limit' | 'network' | 'forbidden' | 'other';

// =============================================================================
// SCAN LIST TYPES
// =============================================================================

/** Scan list item for historical scan selection */
export interface ScanListItem {
  id: string;
  createdAt: string;
  notes: string | null;
  streamCount: number;
  channelsSucceeded?: number;
  channelsFailed?: number;
  channelsPartial?: number;
}
