import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/cluster-api', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET /clusters - List all brand clusters with channel counts
    if (path === '/clusters' || path === '/clusters/') {
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('brand_cluster, network_group')
        .eq('is_active', true);

      const clusterMap = new Map<string, { times: number; competition: number }>();
      
      for (const channel of channels || []) {
        const cluster = channel.brand_cluster || 'Other';
        const current = clusterMap.get(cluster) || { times: 0, competition: 0 };
        if (channel.network_group === 'TIMES') {
          current.times += 1;
        } else {
          current.competition += 1;
        }
        clusterMap.set(cluster, current);
      }

      const clusters = Array.from(clusterMap.entries()).map(([id, counts]) => ({
        id,
        name: id,
        timesChannels: counts.times,
        competitionChannels: counts.competition,
        totalChannels: counts.times + counts.competition,
      })).sort((a, b) => b.totalChannels - a.totalChannels);

      return new Response(JSON.stringify(clusters), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /summaries - Cluster performance summaries
    if (path === '/summaries' || path === '/summaries/') {
      const scanId = url.searchParams.get('scanId');

      // Get target scan
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_vod_scans')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        targetScanId = latestScan?.id;
      }

      if (!targetScanId) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all channels
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, brand_cluster, network_group')
        .eq('is_active', true);

      const channelMap = new Map((channels || []).map(c => [c.id, c]));

      // Get metrics for this scan
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count')
        .eq('scan_id', targetScanId);

      const metricsByVideo = new Map((metrics || []).map(m => [m.video_id, m]));
      const videoIds = (metrics || []).map(m => m.video_id);

      // Get videos
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkVideos } = await supabase
          .from('yt_vod_videos')
          .select('id, channel_id')
          .in('id', chunk);
        videos = videos.concat(chunkVideos || []);
      }

      // Aggregate by cluster and network
      const clusterStats = new Map<string, {
        timesViews: number; competitionViews: number;
        timesLikes: number; competitionLikes: number;
        timesVideos: number; competitionVideos: number;
        topChannel: { name: string; network: string; views: number };
      }>();

      const channelViews = new Map<string, number>();

      for (const video of videos) {
        const channel = channelMap.get(video.channel_id);
        if (!channel) continue;

        const cluster = channel.brand_cluster || 'Other';
        const network = channel.network_group;
        const m = metricsByVideo.get(video.id);
        const views = m?.view_count || 0;
        const likes = m?.like_count || 0;

        // Track channel totals
        channelViews.set(channel.id, (channelViews.get(channel.id) || 0) + views);

        const current = clusterStats.get(cluster) || {
          timesViews: 0, competitionViews: 0,
          timesLikes: 0, competitionLikes: 0,
          timesVideos: 0, competitionVideos: 0,
          topChannel: { name: '', network: '', views: 0 },
        };

        if (network === 'TIMES') {
          current.timesViews += views;
          current.timesLikes += likes;
          current.timesVideos += 1;
        } else {
          current.competitionViews += views;
          current.competitionLikes += likes;
          current.competitionVideos += 1;
        }

        clusterStats.set(cluster, current);
      }

      // Find top channel per cluster
      for (const video of videos) {
        const channel = channelMap.get(video.channel_id);
        if (!channel) continue;

        const cluster = channel.brand_cluster || 'Other';
        const stats = clusterStats.get(cluster);
        if (!stats) continue;

        const totalViews = channelViews.get(channel.id) || 0;
        if (totalViews > stats.topChannel.views) {
          stats.topChannel = {
            name: channel.display_name,
            network: channel.network_group,
            views: totalViews,
          };
        }
      }

      // Format response
      const summaries = Array.from(clusterStats.entries()).map(([cluster, stats]) => {
        const totalViews = stats.timesViews + stats.competitionViews;
        const timesShare = totalViews > 0 ? (stats.timesViews / totalViews) * 100 : 0;
        const competitionShare = totalViews > 0 ? (stats.competitionViews / totalViews) * 100 : 0;

        const timesEngagement = stats.timesViews > 0 
          ? (stats.timesLikes / stats.timesViews) * 100 : 0;
        const competitionEngagement = stats.competitionViews > 0 
          ? (stats.competitionLikes / stats.competitionViews) * 100 : 0;

        let leader: 'TIMES' | 'COMPETITION' | 'TIE' = 'TIE';
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

      return new Response(JSON.stringify(summaries), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /analytics - Detailed cluster analytics
    if (path === '/analytics' || path === '/analytics/') {
      const cluster = url.searchParams.get('cluster');
      const scanId = url.searchParams.get('scanId');

      if (!cluster) {
        return new Response(JSON.stringify({ error: 'cluster parameter required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get target scan
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_vod_scans')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        targetScanId = latestScan?.id;
      }

      if (!targetScanId) {
        return new Response(JSON.stringify({ error: 'No scans found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get channels in this cluster
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .eq('brand_cluster', cluster)
        .eq('is_active', true);

      const channelIds = (channels || []).map(c => c.id);
      const channelMap = new Map((channels || []).map(c => [c.id, c]));

      // Get videos for these channels
      const { data: videos } = await supabase
        .from('yt_vod_videos')
        .select('id, channel_id, video_id, title')
        .in('channel_id', channelIds);

      const videoIds = (videos || []).map(v => v.id);

      // Get metrics for this scan
      const CHUNK_SIZE = 100;
      let metrics: any[] = [];
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkMetrics } = await supabase
          .from('yt_vod_metrics')
          .select('video_id, view_count, like_count')
          .eq('scan_id', targetScanId)
          .in('video_id', chunk);
        metrics = metrics.concat(chunkMetrics || []);
      }

      const metricsByVideo = new Map(metrics.map(m => [m.video_id, m]));

      // Aggregate by channel
      const channelStats = new Map<string, { views: number; likes: number; videoCount: number }>();
      
      for (const video of videos || []) {
        const m = metricsByVideo.get(video.id);
        if (!m) continue;

        const current = channelStats.get(video.channel_id) || { views: 0, likes: 0, videoCount: 0 };
        current.views += m.view_count || 0;
        current.likes += m.like_count || 0;
        current.videoCount += 1;
        channelStats.set(video.channel_id, current);
      }

      // Build channel lists
      const timesChannels: any[] = [];
      const competitionChannels: any[] = [];

      for (const [channelId, stats] of channelStats.entries()) {
        const channel = channelMap.get(channelId);
        if (!channel) continue;

        const channelData = {
          channelId,
          channelName: channel.display_name,
          networkGroup: channel.network_group,
          totalViews: stats.views,
          totalLikes: stats.likes,
          videoCount: stats.videoCount,
          avgViews: stats.videoCount > 0 ? Math.round(stats.views / stats.videoCount) : 0,
          engagementRate: stats.views > 0 ? (stats.likes / stats.views) * 100 : 0,
          rank: 0,
        };

        if (channel.network_group === 'TIMES') {
          timesChannels.push(channelData);
        } else {
          competitionChannels.push(channelData);
        }
      }

      // Sort and rank
      timesChannels.sort((a, b) => b.totalViews - a.totalViews);
      competitionChannels.sort((a, b) => b.totalViews - a.totalViews);
      timesChannels.forEach((c, i) => c.rank = i + 1);
      competitionChannels.forEach((c, i) => c.rank = i + 1);

      // Calculate totals
      const timesTotalViews = timesChannels.reduce((sum, c) => sum + c.totalViews, 0);
      const timesTotalLikes = timesChannels.reduce((sum, c) => sum + c.totalLikes, 0);
      const timesTotalVideos = timesChannels.reduce((sum, c) => sum + c.videoCount, 0);

      const compTotalViews = competitionChannels.reduce((sum, c) => sum + c.totalViews, 0);
      const compTotalLikes = competitionChannels.reduce((sum, c) => sum + c.totalLikes, 0);
      const compTotalVideos = competitionChannels.reduce((sum, c) => sum + c.videoCount, 0);

      // Extract keywords
      const keywordStats = new Map<string, { count: number; views: number; times: number; comp: number }>();
      const STOP_WORDS = new Set([
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
        "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "it", "its", "this", "that", "these", "those", "i", "me", "my",
        "we", "our", "you", "your", "he", "him", "his", "she", "her", "they",
        "them", "their", "what", "which", "who", "whom", "when", "where", "why",
        "how", "all", "each", "few", "more", "most", "other", "some", "such",
        "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
        "live", "watch", "video", "news", "breaking", "latest", "update", "hindi",
        "english", "india", "indian", "full", "new", "official", "tv", "channel"
      ]);

      for (const video of videos || []) {
        const m = metricsByVideo.get(video.id);
        if (!m) continue;
        
        const channel = channelMap.get(video.channel_id);
        const isTimesCh = channel?.network_group === 'TIMES';
        const views = m.view_count || 0;

        const words = video.title
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

        for (const word of words) {
          const current = keywordStats.get(word) || { count: 0, views: 0, times: 0, comp: 0 };
          current.count += 1;
          current.views += views;
          if (isTimesCh) current.times += 1;
          else current.comp += 1;
          keywordStats.set(word, current);
        }
      }

      const topKeywords = Array.from(keywordStats.entries())
        .filter(([_, s]) => s.count >= 2)
        .map(([keyword, s]) => ({
          keyword,
          usageCount: s.count,
          avgViews: Math.round(s.views / s.count),
          timesUsage: s.times,
          competitionUsage: s.comp,
        }))
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 20);

      // Top videos
      const topVideos = (videos || [])
        .map(v => {
          const m = metricsByVideo.get(v.id);
          const channel = channelMap.get(v.channel_id);
          return {
            videoId: v.video_id,
            title: v.title,
            channelName: channel?.display_name || 'Unknown',
            networkGroup: channel?.network_group || 'COMPETITION',
            viewCount: m?.view_count || 0,
            engagementRate: m?.view_count > 0 ? ((m?.like_count || 0) / m.view_count) * 100 : 0,
          };
        })
        .filter(v => v.viewCount > 0)
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 10);

      const totalViews = timesTotalViews + compTotalViews;
      const totalLikes = timesTotalLikes + compTotalLikes;

      const response = {
        cluster,
        summary: {
          totalViews,
          totalVideos: timesTotalVideos + compTotalVideos,
          avgEngagement: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0,
          timesMarketShare: totalViews > 0 ? (timesTotalViews / totalViews) * 100 : 0,
        },
        timesPerformance: {
          totalViews: timesTotalViews,
          totalVideos: timesTotalVideos,
          avgViews: timesTotalVideos > 0 ? Math.round(timesTotalViews / timesTotalVideos) : 0,
          avgEngagement: timesTotalViews > 0 ? (timesTotalLikes / timesTotalViews) * 100 : 0,
          channels: timesChannels,
        },
        competitionPerformance: {
          totalViews: compTotalViews,
          totalVideos: compTotalVideos,
          avgViews: compTotalVideos > 0 ? Math.round(compTotalViews / compTotalVideos) : 0,
          avgEngagement: compTotalViews > 0 ? (compTotalLikes / compTotalViews) * 100 : 0,
          channels: competitionChannels,
        },
        topKeywords,
        topVideos,
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /market-share - Overall and per-cluster market share
    if (path === '/market-share' || path === '/market-share/') {
      const scanId = url.searchParams.get('scanId');

      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_vod_scans')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        targetScanId = latestScan?.id;
      }

      if (!targetScanId) {
        return new Response(JSON.stringify({ overall: { timesShare: 0, competitionShare: 0 }, byCluster: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get all channels
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, brand_cluster, network_group')
        .eq('is_active', true);

      const channelMap = new Map((channels || []).map(c => [c.id, c]));

      // Get metrics
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count')
        .eq('scan_id', targetScanId);

      const videoIds = (metrics || []).map(m => m.video_id);
      const metricsByVideo = new Map((metrics || []).map(m => [m.video_id, m.view_count || 0]));

      // Get videos
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkVideos } = await supabase
          .from('yt_vod_videos')
          .select('id, channel_id')
          .in('id', chunk);
        videos = videos.concat(chunkVideos || []);
      }

      // Aggregate
      let overallTimes = 0;
      let overallComp = 0;
      const clusterViews = new Map<string, { times: number; comp: number }>();

      for (const video of videos) {
        const channel = channelMap.get(video.channel_id);
        if (!channel) continue;

        const views = metricsByVideo.get(video.id) || 0;
        const cluster = channel.brand_cluster || 'Other';
        const isTimes = channel.network_group === 'TIMES';

        if (isTimes) overallTimes += views;
        else overallComp += views;

        const current = clusterViews.get(cluster) || { times: 0, comp: 0 };
        if (isTimes) current.times += views;
        else current.comp += views;
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

      return new Response(JSON.stringify({
        overall: {
          timesShare: overallTotal > 0 ? Math.round((overallTimes / overallTotal) * 1000) / 10 : 0,
          competitionShare: overallTotal > 0 ? Math.round((overallComp / overallTotal) * 1000) / 10 : 0,
        },
        byCluster,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cluster API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
