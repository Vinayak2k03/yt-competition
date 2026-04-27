/**
 * VOD Scan API client — now calls our Express backend instead of Supabase.
 */
import { formatDuration, formatViews, formatNumber, formatDateTime, formatDate } from './formatting';
import type {
  VODScan, VODChannelOverview, VODVideo, VODVideosResponse,
  VODKeywordStat, VODTagStat, VODScanHealth,
} from './types';

export type { VODScan, VODChannelOverview, VODVideo, VODVideosResponse, VODKeywordStat, VODTagStat, VODScanHealth };
export { formatDuration, formatViews, formatNumber, formatDateTime, formatDate };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function getAuthHeaders(): Record<string, string> {
  return {};
}

async function callVodApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/vod-api${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function getLatestVODScan(): Promise<VODScan | null> {
  return callVodApi<VODScan | null>('/latest-scan');
}

export async function getVODScans(limit?: number): Promise<VODScan[]> {
  return callVodApi<VODScan[]>('/scans', limit ? { limit: limit.toString() } : undefined);
}

export async function getVODOverview(scanId?: string): Promise<VODChannelOverview[]> {
  return callVodApi<VODChannelOverview[]>('/overview', scanId ? { scanId } : undefined);
}

export async function getVODVideos(params?: {
  scanId?: string; channelId?: string;
  sortBy?: 'views' | 'likes' | 'engagement' | 'published' | 'duration';
  sortOrder?: 'asc' | 'desc'; page?: number; limit?: number;
}): Promise<VODVideosResponse> {
  const q: Record<string, string> = {};
  if (params?.scanId) q.scanId = params.scanId;
  if (params?.channelId) q.channelId = params.channelId;
  if (params?.sortBy) q.sortBy = params.sortBy;
  if (params?.sortOrder) q.sortOrder = params.sortOrder;
  if (params?.page) q.page = params.page.toString();
  if (params?.limit) q.limit = params.limit.toString();
  return callVodApi<VODVideosResponse>('/videos', Object.keys(q).length ? q : undefined);
}

export async function getVODKeywords(scanId?: string, limit?: number): Promise<VODKeywordStat[]> {
  const p: Record<string, string> = {};
  if (scanId) p.scanId = scanId;
  if (limit) p.limit = limit.toString();
  return callVodApi<VODKeywordStat[]>('/keywords', Object.keys(p).length ? p : undefined);
}

export async function getVODTags(scanId?: string, limit?: number): Promise<VODTagStat[]> {
  const p: Record<string, string> = {};
  if (scanId) p.scanId = scanId;
  if (limit) p.limit = limit.toString();
  return callVodApi<VODTagStat[]>('/tags', Object.keys(p).length ? p : undefined);
}

export async function getVODScanHealth(scanId: string): Promise<VODScanHealth> {
  return callVodApi<VODScanHealth>('/scan-health', { scanId });
}

export interface PublishTimingData {
  heatmap: { day: number; hour: number; count: number; avgViews: number; totalViews: number }[];
  hourly: { hour: number; count: number; avgViews: number; totalViews: number; avgEngagement: number }[];
  daily: { day: number; dayName: string; count: number; avgViews: number; totalViews: number; avgEngagement: number }[];
  topSlots: { day: number; hour: number; dayName: string; label: string; count: number; avgViews: number; totalViews: number }[];
  channelPatterns: { channelId: string; channelName: string; networkGroup: string; videoCount: number; avgViews: number; peakHour: number | null; peakHourCount: number }[];
  perChannelHeatmap: Record<string, { day: number; hour: number; count: number; totalViews: number; avgViews: number }[]>;
  competitionIntensity: { day: number; hour: number; channelCount: number; totalViews: number; avgViews: number }[];
  dailyFrequency: { date: string; channelId: string; channelName: string; count: number }[];
  aggregateStats: { totalVideos: number; totalViews: number; avgViewsPerVideo: number; avgEngagement: number };
}

export async function getPublishTimingData(scanId?: string, networkGroup?: string, dateFrom?: string, dateTo?: string): Promise<PublishTimingData> {
  const p: Record<string, string> = {};
  if (scanId) p.scanId = scanId;
  if (networkGroup) p.networkGroup = networkGroup;
  if (dateFrom) p.dateFrom = dateFrom;
  if (dateTo) p.dateTo = dateTo;
  return callVodApi<PublishTimingData>('/publish-timing', Object.keys(p).length ? p : undefined);
}

export interface VODScanOptions {
  scanType?: 'full' | 'incremental' | 'single_channel' | 'daily';
  channelId?: string;
  videosPerChannel?: number;
  dailyOnly?: boolean;
  resumeScanId?: string;
}

export interface VODScanResult {
  success: boolean; scanId?: string; error?: string;
  isComplete?: boolean; canResume?: boolean; completionReason?: string;
  summary?: {
    channelsTotal: number; channelsProcessed: number; channelsRemaining: number;
    videosRequested: number; videosFetched: number;
    channelsSucceeded: number; channelsFailed: number; completionReason?: string;
  };
}

export async function runVODScan(options?: VODScanOptions): Promise<VODScanResult> {
  const dailyOnly = options?.dailyOnly !== false;
  const body = {
    scanType: options?.scanType ?? 'daily',
    ...(!dailyOnly && options?.videosPerChannel ? { videosPerChannel: options.videosPerChannel } : {}),
    dailyOnly,
    resumeScanId: options?.resumeScanId ?? null,
    ...options,
  };
  const res = await fetch(`${API_URL}/vod-api/run-vod-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 504 || res.status === 502) {
      return { success: false, error: `Server timeout (${res.status}).`, isComplete: false, canResume: true, completionReason: 'timeout' };
    }
    const text = await res.text().catch(() => 'Unknown error');
    try { return JSON.parse(text); } catch { return { success: false, error: `Server error: ${res.status}` }; }
  }
  return res.json();
}

export async function resumeVODScan(scanId: string): Promise<VODScanResult> {
  return runVODScan({ resumeScanId: scanId });
}
