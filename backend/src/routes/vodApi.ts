/**
 * VOD API routes — replaces Supabase Edge Function `vod-api`
 * All endpoints: /vod-api/latest-scan, /vod-api/scans, /vod-api/overview,
 *                /vod-api/videos, /vod-api/keywords, /vod-api/tags,
 *                /vod-api/scan-health, /vod-api/publish-timing,
 *                POST /vod-api/run-vod-scan
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { runVodScan } from '../services/vodScanService.js';

const router = Router();

// Helper — resolve latest VOD scan ID
async function resolveVodScanId(scanId?: string): Promise<string | null> {
  if (scanId) return scanId;
  const latest = await prisma.ytVodScan.findFirst({
    where: { totalVideosFetched: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? null;
}

// ---------------------------------------------------------------------------
// GET /vod-api/latest-scan
// ---------------------------------------------------------------------------
router.get('/latest-scan', async (_req, res: Response) => {
  try {
    const scan = await prisma.ytVodScan.findFirst({
      where: { totalVideosFetched: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
    });
    if (!scan) return res.json(null);

    res.json({
      id: scan.id, scanType: scan.scanType, createdAt: scan.createdAt,
      isComplete: scan.isComplete, canResume: !scan.isComplete && scan.isResumable,
      completionReason: scan.completionReason,
      totalVideosFetched: scan.totalVideosFetched,
      channelsSucceeded: scan.channelsSucceeded,
      channelsFailed: scan.channelsFailed,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch latest VOD scan' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/scans?limit=
// ---------------------------------------------------------------------------
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '30', 10), 100);
    const scans = await prisma.ytVodScan.findMany({
      where: { totalVideosFetched: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(scans.map(s => ({
      id: s.id, scanType: s.scanType, createdAt: s.createdAt,
      isComplete: s.isComplete, canResume: !s.isComplete && s.isResumable,
      totalVideosFetched: s.totalVideosFetched, channelsSucceeded: s.channelsSucceeded,
      channelsFailed: s.channelsFailed, completionReason: s.completionReason,
    })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch VOD scans' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/overview?scanId=
// ---------------------------------------------------------------------------
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const scanId = await resolveVodScanId(req.query.scanId as string);
    if (!scanId) return res.json([]);

    const statuses = await prisma.ytVodScanChannelStatus.findMany({
      where: { scanId },
      include: { channel: true },
    });

    // Get metrics for this scan grouped by channel
    const metrics = await prisma.ytVodMetric.findMany({
      where: { scanId },
      include: { video: { select: { channelId: true } } },
    });

    const channelMetricsMap = new Map<string, { totalViews: bigint; totalLikes: bigint; videoCount: number }>();
    for (const m of metrics) {
      const chId = m.video.channelId;
      const cur = channelMetricsMap.get(chId) || { totalViews: 0n, totalLikes: 0n, videoCount: 0 };
      cur.totalViews += m.viewCount;
      cur.totalLikes += m.likeCount ?? 0n;
      cur.videoCount++;
      channelMetricsMap.set(chId, cur);
    }

    res.json(statuses.map(s => {
      const m = channelMetricsMap.get(s.channelId);
      return {
        channelId: s.channelId,
        channelName: s.channel.displayName,
        networkGroup: s.channel.networkGroup ?? 'COMPETITION',
        brandCluster: s.channel.brandCluster ?? '',
        status: s.status,
        videosFetched: s.videosFetched,
        videosRequested: s.videosRequested,
        totalViews: m ? Number(m.totalViews) : 0,
        totalLikes: m ? Number(m.totalLikes) : 0,
        videoCount: m?.videoCount ?? 0,
        totalVideos: m?.videoCount ?? 0,
        avgViews: m && m.videoCount > 0 ? Number(m.totalViews) / m.videoCount : 0,
        engagementRate: m && Number(m.totalViews) > 0 ? (Number(m.totalLikes) / Number(m.totalViews)) * 100 : 0,
      };
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch VOD overview' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/videos?scanId=&channelId=&sortBy=&sortOrder=&page=&limit=
// ---------------------------------------------------------------------------
router.get('/videos', async (req: Request, res: Response) => {
  try {
    const { channelId, sortBy = 'views', sortOrder = 'desc' } = req.query as Record<string, string>;
    const scanId = await resolveVodScanId(req.query.scanId as string);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, parseInt((req.query.limit as string) ?? '50', 10));
    const skip = (page - 1) * limit;

    if (!scanId) return res.json({ videos: [], total: 0, page, limit, hasMore: false });

    // Get video IDs that have metrics in this scan
    const metricRecords = await prisma.ytVodMetric.findMany({
      where: { scanId },
      include: {
        video: {
          include: { channel: true },
        },
      },
    });

    let filtered = metricRecords.filter(m => !channelId || m.video.channelId === channelId);

    // Sort
    const dir = sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'views') return dir * (Number(b.viewCount) - Number(a.viewCount));
      if (sortBy === 'likes') return dir * (Number(b.likeCount ?? 0n) - Number(a.likeCount ?? 0n));
      if (sortBy === 'published') return dir * (new Date(b.video.publishedAt).getTime() - new Date(a.video.publishedAt).getTime());
      if (sortBy === 'duration') return dir * ((b.video.durationSeconds ?? 0) - (a.video.durationSeconds ?? 0));
      if (sortBy === 'engagement') {
        const aEng = Number(a.viewCount) > 0 ? Number(a.likeCount ?? 0n) / Number(a.viewCount) : 0;
        const bEng = Number(b.viewCount) > 0 ? Number(b.likeCount ?? 0n) / Number(b.viewCount) : 0;
        return dir * (bEng - aEng);
      }
      return 0;
    });

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    const videos = paginated.map(m => ({
      videoId: m.video.videoId,
      title: m.video.title,
      channelId: m.video.channelId,
      channelName: m.video.channel.displayName,
      networkGroup: m.video.channel.networkGroup ?? 'COMPETITION',
      brandCluster: m.video.channel.brandCluster ?? '',
      publishedAt: m.video.publishedAt,
      thumbnailUrl: m.video.thumbnailUrl,
      duration: m.video.duration,
      durationSeconds: m.video.durationSeconds,
      viewCount: Number(m.viewCount),
      likeCount: m.likeCount !== null ? Number(m.likeCount) : null,
      commentCount: m.commentCount !== null ? Number(m.commentCount) : null,
      engagementRate: Number(m.viewCount) > 0 ? Number(m.likeCount ?? 0n) / Number(m.viewCount) : 0,
      tags: m.video.tags,
    }));

    res.json({ videos, total, page, limit, hasMore: skip + paginated.length < total });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch VOD videos' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/keywords?scanId=&limit=
// ---------------------------------------------------------------------------
router.get('/keywords', async (req: Request, res: Response) => {
  try {
    const scanId = await resolveVodScanId(req.query.scanId as string);
    const limit = Math.min(200, parseInt((req.query.limit as string) ?? '100', 10));
    if (!scanId) return res.json([]);

    const stats = await prisma.ytVodKeywordStat.findMany({
      where: { scanId },
      orderBy: { avgViews: 'desc' },
      take: limit,
    });
    res.json(stats.map(s => ({
      keyword: s.keyword, usageCount: s.usageCount,
      totalViews: Number(s.totalViews), avgViews: Number(s.avgViews),
      totalLikes: Number(s.totalLikes), avgLikes: Number(s.avgLikes),
      avgEngagementRate: Number(s.avgEngagementRate ?? 0),
    })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch VOD keywords' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/tags?scanId=&limit=
// ---------------------------------------------------------------------------
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const scanId = await resolveVodScanId(req.query.scanId as string);
    const limit = Math.min(200, parseInt((req.query.limit as string) ?? '100', 10));
    if (!scanId) return res.json([]);

    const stats = await prisma.ytVodTagStat.findMany({
      where: { scanId },
      orderBy: { usageCount: 'desc' },
      take: limit,
    });
    res.json(stats.map(s => ({
      tag: s.tag, usageCount: s.usageCount,
      totalViews: Number(s.totalViews), avgViews: Number(s.avgViews),
      totalLikes: Number(s.totalLikes), avgEngagementRate: Number(s.avgEngagementRate ?? 0),
    })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch VOD tags' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/scan-health?scanId=
// ---------------------------------------------------------------------------
router.get('/scan-health', async (req: Request, res: Response) => {
  try {
    const scanId = req.query.scanId as string;
    if (!scanId) return res.status(400).json({ error: 'scanId required' });

    const [scan, statuses] = await Promise.all([
      prisma.ytVodScan.findUnique({ where: { id: scanId } }),
      prisma.ytVodScanChannelStatus.findMany({ where: { scanId }, include: { channel: { select: { displayName: true } } } }),
    ]);

    res.json({
      scanId, isComplete: scan?.isComplete ?? false,
      canResume: !scan?.isComplete && (scan?.isResumable ?? false),
      totalVideosFetched: scan?.totalVideosFetched ?? 0,
      channelsSucceeded: statuses.filter(s => s.status === 'success').length,
      channelsFailed: statuses.filter(s => s.status === 'failed').length,
      channelsPartial: statuses.filter(s => s.status === 'partial').length,
      channelsPending: statuses.filter(s => s.status === 'pending').length,
      channels: statuses.map(s => ({
        channelId: s.channelId, channelName: s.channel.displayName,
        status: s.status, videosFetched: s.videosFetched,
        videosRequested: s.videosRequested, errorMessage: s.errorMessage,
      })),
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch VOD scan health' }); }
});

// ---------------------------------------------------------------------------
// GET /vod-api/publish-timing?scanId=&networkGroup=&dateFrom=&dateTo=
// ---------------------------------------------------------------------------
router.get('/publish-timing', async (req: Request, res: Response) => {
  try {
    const { networkGroup, dateFrom, dateTo } = req.query as Record<string, string>;
    const scanId = await resolveVodScanId(req.query.scanId as string);
    if (!scanId) return res.json({ heatmap: [], hourly: [], daily: [], topSlots: [], channelPatterns: [], perChannelHeatmap: {}, competitionIntensity: [], dailyFrequency: [], aggregateStats: { totalVideos: 0, totalViews: 0, avgViewsPerVideo: 0, avgEngagement: 0 } });

    const channelFilter: any = {};
    if (networkGroup) channelFilter.networkGroup = networkGroup;

    const videos = await prisma.ytVodVideo.findMany({
      where: {
        channel: channelFilter,
        ...(dateFrom || dateTo ? { publishedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
      },
      include: {
        channel: { select: { id: true, displayName: true, networkGroup: true } },
        metrics: { where: { scanId }, select: { viewCount: true, likeCount: true }, take: 1 },
      },
    });

    // Build heatmap: day (0=Sun) × hour
    const heatmap: Record<string, { count: number; totalViews: number }> = {};
    const hourly: Record<number, { count: number; totalViews: number; totalLikes: number }> = {};
    const daily: Record<number, { count: number; totalViews: number; totalLikes: number }> = {};
    let totalViews = 0, totalLikes = 0;

    for (const v of videos) {
      const d = new Date(v.publishedAt);
      const day = d.getUTCDay();
      const hour = d.getUTCHours();
      const views = Number(v.metrics[0]?.viewCount ?? 0);
      const likes = Number(v.metrics[0]?.likeCount ?? 0);
      totalViews += views; totalLikes += likes;

      const key = `${day}_${hour}`;
      const h = heatmap[key] || { count: 0, totalViews: 0 };
      h.count++; h.totalViews += views; heatmap[key] = h;

      const hr = hourly[hour] || { count: 0, totalViews: 0, totalLikes: 0 };
      hr.count++; hr.totalViews += views; hr.totalLikes += likes; hourly[hour] = hr;

      const dy = daily[day] || { count: 0, totalViews: 0, totalLikes: 0 };
      dy.count++; dy.totalViews += views; dy.totalLikes += likes; daily[day] = dy;
    }

    const heatmapArr = Object.entries(heatmap).map(([key, v]) => {
      const [day, hour] = key.split('_').map(Number);
      return { day, hour, count: v.count, avgViews: v.count > 0 ? Math.round(v.totalViews / v.count) : 0, totalViews: v.totalViews };
    });

    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    res.json({
      heatmap: heatmapArr,
      hourly: Object.entries(hourly).map(([hour, v]) => ({
        hour: Number(hour), count: v.count,
        avgViews: v.count > 0 ? Math.round(v.totalViews / v.count) : 0,
        totalViews: v.totalViews,
        avgEngagement: v.totalViews > 0 ? v.totalLikes / v.totalViews : 0,
      })).sort((a, b) => a.hour - b.hour),
      daily: Object.entries(daily).map(([day, v]) => ({
        day: Number(day), dayName: DAYS[Number(day)], count: v.count,
        avgViews: v.count > 0 ? Math.round(v.totalViews / v.count) : 0,
        totalViews: v.totalViews,
        avgEngagement: v.totalViews > 0 ? v.totalLikes / v.totalViews : 0,
      })).sort((a, b) => a.day - b.day),
      topSlots: heatmapArr.sort((a, b) => b.avgViews - a.avgViews).slice(0, 10).map(s => ({
        ...s, dayName: DAYS[s.day], label: `${DAYS[s.day]} ${s.hour}:00`,
      })),
      channelPatterns: [],
      perChannelHeatmap: {},
      competitionIntensity: [],
      dailyFrequency: [],
      aggregateStats: {
        totalVideos: videos.length, totalViews,
        avgViewsPerVideo: videos.length > 0 ? Math.round(totalViews / videos.length) : 0,
        avgEngagement: totalViews > 0 ? totalLikes / totalViews : 0,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch publish timing' }); }
});

// ---------------------------------------------------------------------------
// POST /vod-api/run-vod-scan
// ---------------------------------------------------------------------------
router.post('/run-vod-scan', async (req: Request, res: Response) => {
  try {
    const { scanType, channelId, dailyOnly, videosPerChannel, resumeScanId } = req.body || {};
    const result = await runVodScan({ scanType, channelId, dailyOnly, videosPerChannel, resumeScanId });
    res.json(result);
  } catch (err: any) {
    console.error('run-vod-scan error:', err);
    res.status(500).json({ success: false, error: err.message || 'VOD scan failed' });
  }
});

export default router;
