/**
 * Live Stream API routes — replaces Supabase Edge Function `api`
 * Endpoints: /api/latest-scan, /api/overview, /api/top-streams,
 *            /api/title-word-cloud, /api/hashtag-ranking, /api/channels,
 *            /api/scans, /api/scan-health
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/latest-scan
// ---------------------------------------------------------------------------
router.get('/latest-scan', async (_req: Request, res: Response) => {
  try {
    // Find the latest scan that has at least one stream metric
    const scan = await prisma.ytScan.findFirst({
      where: {
        streamScanMetrics: { some: {} },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!scan) {
      res.json(null);
      return;
    }

    // Check for newer scans that have no data (failed scans)
    const newerFailedScans = await prisma.ytScan.count({
      where: {
        createdAt: { gt: scan.createdAt },
        streamScanMetrics: { none: {} },
      },
    });

    const streamCount = await prisma.ytStreamScanMetric.count({
      where: { scanId: scan.id },
    });

    res.json({
      id: scan.id,
      created_at: scan.createdAt,
      notes: scan.notes,
      streamCount,
      hasNewerFailedScans: newerFailedScans > 0,
      failedScanCount: newerFailedScans,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch latest scan' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/overview?scanId=...
// ---------------------------------------------------------------------------
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.query as { scanId?: string };

    // Resolve scan ID
    let effectiveScanId = scanId;
    if (!effectiveScanId) {
      const latest = await prisma.ytScan.findFirst({
        where: { streamScanMetrics: { some: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) { res.json([]); return; }
      effectiveScanId = latest.id;
    }

    const summaries = await prisma.ytScanChannelSummary.findMany({
      where: { scanId: effectiveScanId },
      include: { channel: true },
      orderBy: { totalConcurrentViews: 'desc' },
    });

    const result = summaries.map((s) => ({
      channelId: s.channelId,
      channelName: s.channel.displayName,
      networkGroup: s.channel.networkGroup ?? 'COMPETITION',
      brandCluster: s.channel.brandCluster ?? '',
      totalConcurrentViews: s.totalConcurrentViews,
      highestConcurrent: s.highestConcurrent,
      numberOfStreams: s.numberOfStreams,
      averagePeakPerStream: s.averagePeakPerStream,
      lastSuccessfulScan: s.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/top-streams?scanId=...
// ---------------------------------------------------------------------------
router.get('/top-streams', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.query as { scanId?: string };

    let effectiveScanId = scanId;
    if (!effectiveScanId) {
      const latest = await prisma.ytScan.findFirst({
        where: { streamScanMetrics: { some: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) { res.json([]); return; }
      effectiveScanId = latest.id;
    }

    const metrics = await prisma.ytStreamScanMetric.findMany({
      where: { scanId: effectiveScanId },
      include: {
        stream: { include: { channel: true } },
      },
      orderBy: { concurrentViewers: 'desc' },
      take: 100,
    });

    const result = metrics.map((m) => ({
      streamTitle: m.stream.title,
      videoId: m.stream.videoId,
      channelName: m.stream.channel.displayName,
      networkGroup: m.stream.channel.networkGroup ?? 'COMPETITION',
      brandCluster: m.stream.channel.brandCluster ?? '',
      concurrentViewers: m.concurrentViewers,
      viewCount: m.viewCount !== null ? Number(m.viewCount) : null,
      likeCount: m.likeCount !== null ? Number(m.likeCount) : null,
      isLive: m.isLive,
      firstSeenAt: m.stream.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch top streams' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/title-word-cloud?scanId=...
// ---------------------------------------------------------------------------
router.get('/title-word-cloud', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.query as { scanId?: string };

    let effectiveScanId = scanId;
    if (!effectiveScanId) {
      const latest = await prisma.ytScan.findFirst({
        where: { streamScanMetrics: { some: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) { res.json([]); return; }
      effectiveScanId = latest.id;
    }

    const stats = await prisma.ytScanKeywordStat.findMany({
      where: { scanId: effectiveScanId },
      orderBy: { avgConcurrentViews: 'desc' },
      take: 100,
    });

    const result = stats.map((s) => ({
      keyword: s.keyword,
      usageCount: s.usageCount,
      avgConcurrentViews: s.avgConcurrentViews,
      totalConcurrentViews: s.totalConcurrentViews,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch word cloud' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/hashtag-ranking?scanId=...
// ---------------------------------------------------------------------------
router.get('/hashtag-ranking', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.query as { scanId?: string };

    let effectiveScanId = scanId;
    if (!effectiveScanId) {
      const latest = await prisma.ytScan.findFirst({
        where: { streamScanMetrics: { some: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) { res.json([]); return; }
      effectiveScanId = latest.id;
    }

    const stats = await prisma.ytScanTagStat.findMany({
      where: { scanId: effectiveScanId },
      orderBy: { avgConcurrentViews: 'desc' },
      take: 100,
    });

    res.json(
      stats.map((s) => ({
        tag: s.tag,
        usageCount: s.usageCount,
        avgConcurrentViews: s.avgConcurrentViews,
        totalConcurrentViews: s.totalConcurrentViews,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hashtag ranking' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/channels
// ---------------------------------------------------------------------------
router.get('/channels', async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.ytChannel.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scans?startDate=&endDate=&limit=
// ---------------------------------------------------------------------------
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = req.query as Record<string, string>;
    const take = Math.min(parseInt(limit ?? '30', 10), 100);

    const scans = await prisma.ytScan.findMany({
      where: {
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } }),
        streamScanMetrics: { some: {} },
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        _count: { select: { streamScanMetrics: true } },
        scanChannelStatuses: { select: { status: true } },
      },
    });

    const result = scans.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      notes: s.notes,
      streamCount: s._count.streamScanMetrics,
      channelsSucceeded: s.scanChannelStatuses.filter((c) => c.status === 'success').length,
      channelsFailed: s.scanChannelStatuses.filter((c) => c.status === 'failed').length,
      channelsPartial: s.scanChannelStatuses.filter((c) => c.status === 'partial').length,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scan-health?scanId=
// ---------------------------------------------------------------------------
router.get('/scan-health', async (req: Request, res: Response) => {
  try {
    const { scanId } = req.query as { scanId?: string };
    if (!scanId) {
      res.status(400).json({ error: 'scanId is required' });
      return;
    }

    const statuses = await prisma.ytScanChannelStatus.findMany({
      where: { scanId },
      include: { channel: true },
    });

    const result = {
      scanId,
      channelsSucceeded: statuses.filter((s) => s.status === 'success').length,
      channelsFailed: statuses.filter((s) => s.status === 'failed').length,
      channelsPartial: statuses.filter((s) => s.status === 'partial').length,
      channels: statuses.map((s) => ({
        channelId: s.channelId,
        channelName: s.channel.displayName,
        status: s.status,
        streamsFound: s.streamsFound,
        errorMessage: s.errorMessage,
      })),
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scan health' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scan-progress?scanId=&scanType=live|vod
// (replaces useScanProgress.ts direct Supabase polling)
// ---------------------------------------------------------------------------
router.get('/scan-progress', async (req: Request, res: Response) => {
  try {
    const { scanId, scanType, since } = req.query as {
      scanId?: string;
      scanType?: 'live' | 'vod';
      since?: string; // ISO timestamp — for auto-detect mode
    };

    // Auto-detect latest scan created after `since`
    let effectiveScanId = scanId;
    if (!effectiveScanId && since) {
      if (scanType === 'vod') {
        const latest = await prisma.ytVodScan.findFirst({
          where: { createdAt: { gte: new Date(since) } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        effectiveScanId = latest?.id;
      } else {
        const latest = await prisma.ytScan.findFirst({
          where: { createdAt: { gte: new Date(since) } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        effectiveScanId = latest?.id;
      }
    }

    if (!effectiveScanId) {
      res.json({ channels: [], detectedScanId: null });
      return;
    }

    if (scanType === 'vod') {
      const statuses = await prisma.ytVodScanChannelStatus.findMany({
        where: { scanId: effectiveScanId },
        include: { channel: { select: { id: true, displayName: true } } },
      });
      res.json({
        detectedScanId: effectiveScanId,
        channels: statuses.map((s) => ({
          channelId: s.channelId,
          channelName: s.channel.displayName,
          status: s.status,
          videosFetched: s.videosFetched,
          videosRequested: s.videosRequested,
          errorMessage: s.errorMessage,
        })),
      });
    } else {
      const statuses = await prisma.ytScanChannelStatus.findMany({
        where: { scanId: effectiveScanId },
        include: { channel: { select: { id: true, displayName: true } } },
      });
      res.json({
        detectedScanId: effectiveScanId,
        channels: statuses.map((s) => ({
          channelId: s.channelId,
          channelName: s.channel.displayName,
          status: s.status,
          streamsFound: s.streamsFound,
          errorMessage: s.errorMessage,
        })),
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scan progress' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/run-scan — full YouTube Live scan
// ---------------------------------------------------------------------------
import { runLiveScan } from '../services/scanService.js';

router.post('/run-scan', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.body || {};
    const result = await runLiveScan(channelId ?? undefined);
    res.json(result);
  } catch (err: any) {
    console.error('run-scan error:', err);
    res.status(500).json({ success: false, error: err.message || 'Scan failed' });
  }
});

export default router;
