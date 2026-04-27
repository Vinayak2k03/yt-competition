/**
 * Live Stream Scan API client — now calls our Express backend instead of Supabase.
 */

import { formatNumber, formatTime, formatDateTime } from './formatting';
import type {
  LiveScan, LiveChannelOverview, LiveStream, LiveKeywordStat,
  LiveTagStat, LiveScanHealth, ScanListItem, Channel,
} from './types';

export type LatestScan = LiveScan;
export type OverviewItem = LiveChannelOverview;
export type TopStream = LiveStream;
export type KeywordStat = LiveKeywordStat;
export type TagStat = LiveTagStat;
export type ScanHealth = LiveScanHealth;
export type { ScanListItem, Channel };
export { formatNumber, formatTime, formatDateTime };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function getAuthHeaders(): Record<string, string> {
  return {};
}

async function callApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/api${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function getLatestScan(): Promise<LatestScan | null> {
  return callApi<LatestScan | null>('/latest-scan');
}

export async function getOverview(scanId?: string): Promise<OverviewItem[]> {
  return callApi<OverviewItem[]>('/overview', scanId ? { scanId } : undefined);
}

export async function getTopStreams(scanId?: string): Promise<TopStream[]> {
  return callApi<TopStream[]>('/top-streams', scanId ? { scanId } : undefined);
}

export async function getTitleWordCloud(scanId?: string): Promise<KeywordStat[]> {
  return callApi<KeywordStat[]>('/title-word-cloud', scanId ? { scanId } : undefined);
}

export async function getHashtagRanking(scanId?: string): Promise<TagStat[]> {
  return callApi<TagStat[]>('/hashtag-ranking', scanId ? { scanId } : undefined);
}

export async function getChannels(): Promise<Channel[]> {
  return callApi<Channel[]>('/channels');
}

export async function getScans(params?: { startDate?: string; endDate?: string; limit?: number }): Promise<ScanListItem[]> {
  const q: Record<string, string> = {};
  if (params?.startDate) q.startDate = params.startDate;
  if (params?.endDate) q.endDate = params.endDate;
  if (params?.limit) q.limit = params.limit.toString();
  return callApi<ScanListItem[]>('/scans', Object.keys(q).length ? q : undefined);
}

export async function getScanHealth(scanId: string): Promise<ScanHealth> {
  return callApi<ScanHealth>('/scan-health', { scanId });
}

export async function runScan(): Promise<{ success: boolean; scanId?: string; error?: string; liveStreamsFound?: number }> {
  const res = await fetch(`${API_URL}/api/run-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  return res.json();
}

export async function refreshChannel(channelId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/run-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ channelId }),
  });
  return res.json();
}
