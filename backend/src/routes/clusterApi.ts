import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

const router = Router();

// Helper to interact with YouTube API for channel verification
async function fetchChannelFromYoutube(url: string) {
  // We need to fetch an active API key from the database
  const apiKeyRecord = await prisma.ytApiKey.findFirst({
    where: { isActive: true },
    orderBy: { lastUsedAt: 'asc' } // Simple rotation
  });

  if (!apiKeyRecord) {
    throw new Error('No active YouTube API keys available. Please add one in the API Keys section.');
  }

  // Update last used at
  await prisma.ytApiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() }
  });

  const apiKey = apiKeyRecord.apiKey;
  
  // Extract handle or channel ID from URL
  let handleMatch = url.match(/@([a-zA-Z0-9_-]+)/);
  let channelIdMatch = url.match(/channel\/([a-zA-Z0-9_-]+)/);
  
  let searchUrl = '';
  if (handleMatch) {
    searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handleMatch[1])}&key=${apiKey}`;
  } else if (channelIdMatch) {
    searchUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelIdMatch[1]}&key=${apiKey}`;
  } else {
    throw new Error('Invalid YouTube URL format. Must contain @handle or /channel/ID');
  }

  const response = await fetch(searchUrl);
  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'YouTube API error');
  }

  let channelId, title, description, thumbnail;

  if (handleMatch) {
    if (!data.items || data.items.length === 0) throw new Error('Channel not found');
    const item = data.items[0];
    channelId = item.snippet.channelId;
    title = item.snippet.title;
    description = item.snippet.description;
    thumbnail = item.snippet.thumbnails?.default?.url;
  } else {
    if (!data.items || data.items.length === 0) throw new Error('Channel not found');
    const item = data.items[0];
    channelId = item.id;
    title = item.snippet.title;
    description = item.snippet.description;
    thumbnail = item.snippet.thumbnails?.default?.url;
  }

  return { channelId, title, description, thumbnail };
}

// POST /cluster-api/verify-channel
router.post('/verify-channel', async (req: Request, res: Response) => {
  try {
    const { youtube_url } = req.body;
    if (!youtube_url) {
      return res.status(400).json({ error: 'youtube_url is required' });
    }

    const channelData = await fetchChannelFromYoutube(youtube_url);
    res.json({ channel: channelData });
  } catch (error: any) {
    console.error('Verify channel error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to verify channel' });
  }
});


router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const channels = await prisma.ytChannel.findMany({
      where: { isActive: true },
      select: { brandCluster: true, networkGroup: true }
    });
    const clusterMap = new Map();
    for (const channel of channels) {
      const cluster = channel.brandCluster || 'Other';
      const current = clusterMap.get(cluster) || { times: 0, competition: 0 };
      if (channel.networkGroup === 'TIMES') {
        current.times += 1;
      } else {
        current.competition += 1;
      }
      clusterMap.set(cluster, current);
    }
    const clusters = Array.from(clusterMap.entries()).map(([id, counts]) => ({
      id, name: id, timesChannels: counts.times, competitionChannels: counts.competition, totalChannels: counts.times + counts.competition
    })).sort((a, b) => b.totalChannels - a.totalChannels);
    res.json(clusters);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch clusters' }); }
});

router.get('/summaries', async (req: Request, res: Response) => {
  try {
    let targetScanId = req.query.scanId as string | undefined;
    if (!targetScanId) {
      const latest = await prisma.ytVodScan.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
      targetScanId = latest?.id;
    }
    if (!targetScanId) return res.json([]);

    const channels = await prisma.ytChannel.findMany({ where: { isActive: true } });
    const channelMap = new Map(channels.map(c => [c.id, c]));

    const metrics = await prisma.ytVodMetric.findMany({
      where: { scanId: targetScanId },
      include: { video: { select: { channelId: true } } }
    });

    const clusterStats = new Map();
    const channelViews = new Map();

    for (const m of metrics) {
      const channelId = m.video.channelId;
      const channel = channelMap.get(channelId);
      if (!channel) continue;

      const cluster = channel.brandCluster || 'Other';
      const network = channel.networkGroup;
      const views = Number(m.viewCount);
      const likes = Number(m.likeCount || 0);

      channelViews.set(channelId, (channelViews.get(channelId) || 0) + views);

      const current = clusterStats.get(cluster) || {
        timesViews: 0, competitionViews: 0, timesLikes: 0, competitionLikes: 0,
        timesVideos: 0, competitionVideos: 0, topChannel: { name: '', network: '', views: 0 }
      };

      if (network === 'TIMES') {
        current.timesViews += views; current.timesLikes += likes; current.timesVideos += 1;
      } else {
        current.competitionViews += views; current.competitionLikes += likes; current.competitionVideos += 1;
      }
      clusterStats.set(cluster, current);
    }

    for (const m of metrics) {
      const channelId = m.video.channelId;
      const channel = channelMap.get(channelId);
      if (!channel) continue;

      const cluster = channel.brandCluster || 'Other';
      const stats = clusterStats.get(cluster);
      if (!stats) continue;

      const totalViews = channelViews.get(channelId) || 0;
      if (totalViews > stats.topChannel.views) {
        stats.topChannel = { name: channel.displayName, network: channel.networkGroup, views: totalViews };
      }
    }

    const summaries = Array.from(clusterStats.entries()).map(([cluster, stats]) => {
      const totalViews = stats.timesViews + stats.competitionViews;
      const timesShare = totalViews > 0 ? (stats.timesViews / totalViews) * 100 : 0;
      const competitionShare = totalViews > 0 ? (stats.competitionViews / totalViews) * 100 : 0;

      const timesEngagement = stats.timesViews > 0 ? (stats.timesLikes / stats.timesViews) * 100 : 0;
      const competitionEngagement = stats.competitionViews > 0 ? (stats.competitionLikes / stats.competitionViews) * 100 : 0;

      let leader = 'TIE';
      if (stats.timesViews > stats.competitionViews) leader = 'TIMES';
      else if (stats.competitionViews > stats.timesViews) leader = 'COMPETITION';

      return {
        cluster,
        timesShare: Math.round(timesShare * 10) / 10,
        competitionShare: Math.round(competitionShare * 10) / 10,
        timesViews: stats.timesViews,
        competitionViews: stats.competitionViews,
        totalViews,
        timesVideos: stats.timesVideos,
        competitionVideos: stats.competitionVideos,
        totalVideos: stats.timesVideos + stats.competitionVideos,
        timesEngagement: Math.round(timesEngagement * 100) / 100,
        competitionEngagement: Math.round(competitionEngagement * 100) / 100,
        leader,
        leaderChannel: stats.topChannel.name,
      };
    }).sort((a, b) => b.totalViews - a.totalViews);

    res.json(summaries);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const cluster = req.query.cluster as string;
    let targetScanId = req.query.scanId as string | undefined;

    if (!cluster) return res.status(400).json({ error: 'cluster required' });

    if (!targetScanId) {
      const latest = await prisma.ytVodScan.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
      targetScanId = latest?.id;
    }
    if (!targetScanId) return res.status(404).json({ error: 'No scans' });

    const channels = await prisma.ytChannel.findMany({
      where: { brandCluster: cluster, isActive: true }
    });
    const channelIds = channels.map(c => c.id);
    const channelMap = new Map(channels.map(c => [c.id, c]));

    const videos = await prisma.ytVodVideo.findMany({
      where: { channelId: { in: channelIds } },
      include: { metrics: { where: { scanId: targetScanId } } }
    });

    const channelStats = new Map();
    for (const v of videos) {
      const m = v.metrics[0];
      if (!m) continue;

      const current = channelStats.get(v.channelId) || { views: 0, likes: 0, videoCount: 0 };
      current.views += Number(m.viewCount);
      current.likes += Number(m.likeCount || 0);
      current.videoCount += 1;
      channelStats.set(v.channelId, current);
    }

    const timesChannels: any[] = [];
    const competitionChannels: any[] = [];

    for (const [channelId, stats] of channelStats.entries()) {
      const channel = channelMap.get(channelId);
      if (!channel) continue;

      const channelData = {
        channelId, channelName: channel.displayName, networkGroup: channel.networkGroup,
        totalViews: stats.views, totalLikes: stats.likes, videoCount: stats.videoCount,
        avgViews: stats.videoCount > 0 ? Math.round(stats.views / stats.videoCount) : 0,
        engagementRate: stats.views > 0 ? (stats.likes / stats.views) * 100 : 0,
        rank: 0
      };
      if (channel.networkGroup === 'TIMES') timesChannels.push(channelData);
      else competitionChannels.push(channelData);
    }

    timesChannels.sort((a, b) => b.totalViews - a.totalViews).forEach((c, i) => c.rank = i + 1);
    competitionChannels.sort((a, b) => b.totalViews - a.totalViews).forEach((c, i) => c.rank = i + 1);

    const timesTotalViews = timesChannels.reduce((sum, c) => sum + c.totalViews, 0);
    const timesTotalLikes = timesChannels.reduce((sum, c) => sum + c.totalLikes, 0);
    const timesTotalVideos = timesChannels.reduce((sum, c) => sum + c.videoCount, 0);

    const compTotalViews = competitionChannels.reduce((sum, c) => sum + c.totalViews, 0);
    const compTotalLikes = competitionChannels.reduce((sum, c) => sum + c.totalLikes, 0);
    const compTotalVideos = competitionChannels.reduce((sum, c) => sum + c.videoCount, 0);

    const keywordStats = new Map();
    const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "it", "its", "this", "that", "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "they", "them", "their", "what", "which", "who", "whom", "when", "where", "why", "how", "all", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "live", "watch", "video", "news", "breaking", "latest", "update", "hindi", "english", "india", "indian", "full", "new", "official", "tv", "channel"]);

    for (const v of videos) {
      const m = v.metrics[0];
      if (!m) continue;
      const channel = channelMap.get(v.channelId);
      const isTimesCh = channel?.networkGroup === 'TIMES';
      const views = Number(m.viewCount);

      const words = v.title.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

      for (const word of words) {
        const current = keywordStats.get(word) || { count: 0, views: 0, times: 0, comp: 0 };
        current.count += 1; current.views += views;
        if (isTimesCh) current.times += 1; else current.comp += 1;
        keywordStats.set(word, current);
      }
    }

    const topKeywords = Array.from(keywordStats.entries())
      .filter(([_, s]) => s.count >= 2)
      .map(([keyword, s]) => ({
        keyword, usageCount: s.count, avgViews: Math.round(s.views / s.count),
        timesUsage: s.times, competitionUsage: s.comp
      }))
      .sort((a, b) => b.avgViews - a.avgViews).slice(0, 20);

    const topVideos = videos.map(v => {
      const m = v.metrics[0];
      const channel = channelMap.get(v.channelId);
      return {
        videoId: v.videoId, title: v.title, channelName: channel?.displayName || 'Unknown',
        networkGroup: channel?.networkGroup || 'COMPETITION', viewCount: m ? Number(m.viewCount) : 0,
        engagementRate: m && Number(m.viewCount) > 0 ? (Number(m.likeCount || 0) / Number(m.viewCount)) * 100 : 0
      };
    }).filter(v => v.viewCount > 0).sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);

    const totalViews = timesTotalViews + compTotalViews;
    const totalLikes = timesTotalLikes + compTotalLikes;

    res.json({
      cluster,
      summary: { totalViews, totalVideos: timesTotalVideos + compTotalVideos, avgEngagement: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0, timesMarketShare: totalViews > 0 ? (timesTotalViews / totalViews) * 100 : 0 },
      timesPerformance: { totalViews: timesTotalViews, totalVideos: timesTotalVideos, avgViews: timesTotalVideos > 0 ? Math.round(timesTotalViews / timesTotalVideos) : 0, avgEngagement: timesTotalViews > 0 ? (timesTotalLikes / timesTotalViews) * 100 : 0, channels: timesChannels },
      competitionPerformance: { totalViews: compTotalViews, totalVideos: compTotalVideos, avgViews: compTotalVideos > 0 ? Math.round(compTotalViews / compTotalVideos) : 0, avgEngagement: compTotalViews > 0 ? (compTotalLikes / compTotalViews) * 100 : 0, channels: competitionChannels },
      topKeywords, topVideos
    });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/market-share', async (req: Request, res: Response) => {
  try {
    let targetScanId = req.query.scanId as string | undefined;
    if (!targetScanId) {
      const latest = await prisma.ytVodScan.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
      targetScanId = latest?.id;
    }
    if (!targetScanId) return res.json({ overall: { timesShare: 0, competitionShare: 0 }, byCluster: [] });

    const channels = await prisma.ytChannel.findMany({ where: { isActive: true } });
    const channelMap = new Map(channels.map(c => [c.id, c]));

    const metrics = await prisma.ytVodMetric.findMany({
      where: { scanId: targetScanId },
      include: { video: { select: { channelId: true } } }
    });

    let overallTimes = 0, overallComp = 0;
    const clusterViews = new Map();

    for (const m of metrics) {
      const channel = channelMap.get(m.video.channelId);
      if (!channel) continue;

      const views = Number(m.viewCount);
      const cluster = channel.brandCluster || 'Other';
      const isTimes = channel.networkGroup === 'TIMES';

      if (isTimes) overallTimes += views; else overallComp += views;

      const current = clusterViews.get(cluster) || { times: 0, comp: 0 };
      if (isTimes) current.times += views; else current.comp += views;
      clusterViews.set(cluster, current);
    }

    const overallTotal = overallTimes + overallComp;
    const byCluster = Array.from(clusterViews.entries()).map(([cluster, views]) => {
      const total = views.times + views.comp;
      return {
        cluster,
        timesShare: total > 0 ? Math.round((views.times / total) * 1000) / 10 : 0,
        competitionShare: total > 0 ? Math.round((views.comp / total) * 1000) / 10 : 0,
      };
    }).sort((a, b) => a.cluster.localeCompare(b.cluster));

    res.json({
      overall: {
        timesShare: overallTotal > 0 ? Math.round((overallTimes / overallTotal) * 1000) / 10 : 0,
        competitionShare: overallTotal > 0 ? Math.round((overallComp / overallTotal) * 1000) / 10 : 0,
      },
      byCluster,
    });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});


export default router;
