/**
 * Brand Cluster Analytics API client — calls Express backend instead of Supabase.
 */
import type { NetworkGroup } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface BrandCluster {
  id: string; name: string;
  timesChannels: number; competitionChannels: number; totalChannels: number;
}
export interface ClusterSummary {
  cluster: string; timesShare: number; competitionShare: number;
  timesViews: number; competitionViews: number; totalViews: number;
  timesVideos: number; competitionVideos: number; totalVideos: number;
  timesEngagement: number; competitionEngagement: number;
  leader: 'TIMES' | 'COMPETITION' | 'TIE'; leaderChannel: string;
}
export interface ClusterChannel {
  channelId: string; channelName: string; networkGroup: NetworkGroup;
  totalViews: number; totalLikes: number; videoCount: number;
  avgViews: number; engagementRate: number; rank: number;
}
export interface ClusterAnalytics {
  cluster: string;
  summary: { totalViews: number; totalVideos: number; avgEngagement: number; timesMarketShare: number };
  timesPerformance: { totalViews: number; totalVideos: number; avgViews: number; avgEngagement: number; channels: ClusterChannel[] };
  competitionPerformance: { totalViews: number; totalVideos: number; avgViews: number; avgEngagement: number; channels: ClusterChannel[] };
  topKeywords: Array<{ keyword: string; usageCount: number; avgViews: number; timesUsage: number; competitionUsage: number }>;
  topVideos: Array<{ videoId: string; title: string; channelName: string; networkGroup: NetworkGroup; viewCount: number; engagementRate: number }>;
}

async function callClusterApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/cluster-api${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function getBrandClusters(): Promise<BrandCluster[]> {
  return callClusterApi<BrandCluster[]>('/clusters');
}
export async function getClusterSummaries(scanId?: string): Promise<ClusterSummary[]> {
  return callClusterApi<ClusterSummary[]>('/summaries', scanId ? { scanId } : undefined);
}
export async function getClusterAnalytics(cluster: string, scanId?: string): Promise<ClusterAnalytics> {
  return callClusterApi<ClusterAnalytics>('/analytics', { cluster, ...(scanId ? { scanId } : {}) });
}
export async function getMarketShare(scanId?: string): Promise<{
  overall: { timesShare: number; competitionShare: number };
  byCluster: Array<{ cluster: string; timesShare: number; competitionShare: number }>;
}> {
  return callClusterApi('/market-share', scanId ? { scanId } : undefined);
}
