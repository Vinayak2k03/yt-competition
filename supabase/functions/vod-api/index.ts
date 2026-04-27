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
    const path = url.pathname.replace('/vod-api', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET /latest-scan - Get latest VOD scan with data
    if (path === '/latest-scan' || path === '/latest-scan/') {
      const { data: recentScans } = await supabase
        .from('yt_vod_scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!recentScans || recentScans.length === 0) {
        return new Response(JSON.stringify(null), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find first scan with video data
      let successfulScan = null;
      for (const scan of recentScans) {
        const { count } = await supabase
          .from('yt_vod_metrics')
          .select('id', { count: 'exact', head: true })
          .eq('scan_id', scan.id);

        if (count && count > 0) {
          successfulScan = { ...scan, videoCount: count };
          break;
        }
      }

      return new Response(JSON.stringify(successfulScan || { ...recentScans[0], videoCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /scans - List all VOD scans
    if (path === '/scans' || path === '/scans/') {
      const limit = parseInt(url.searchParams.get('limit') || '30', 10);

      const { data: scans, error } = await supabase
        .from('yt_vod_scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return new Response(JSON.stringify(scans || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /overview - Channel-level VOD performance summary
    if (path === '/overview' || path === '/overview/') {
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
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get channel statuses for this scan
      const { data: channelStatuses } = await supabase
        .from('yt_vod_scan_channel_status')
        .select('*')
        .eq('scan_id', targetScanId);

      const channelIds = (channelStatuses || []).map(s => s.channel_id);

      // Get channel info
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .in('id', channelIds);

      const channelMap: Record<string, any> = {};
      (channels || []).forEach(c => { channelMap[c.id] = c; });

      // Get video counts and metrics per channel
      const { data: videos } = await supabase
        .from('yt_vod_videos')
        .select('id, channel_id')
        .in('channel_id', channelIds);

      const videosByChannel: Record<string, string[]> = {};
      (videos || []).forEach(v => {
        if (!videosByChannel[v.channel_id]) videosByChannel[v.channel_id] = [];
        videosByChannel[v.channel_id].push(v.id);
      });

      // Get metrics for this scan
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count')
        .eq('scan_id', targetScanId);

      const metricsByVideo: Record<string, any> = {};
      (metrics || []).forEach(m => { metricsByVideo[m.video_id] = m; });

      // Aggregate per channel
      const overview = (channelStatuses || []).map(status => {
        const channel = channelMap[status.channel_id];
        const channelVideoIds = videosByChannel[status.channel_id] || [];
        
        let totalViews = 0;
        let totalLikes = 0;
        let videosWithMetrics = 0;

        channelVideoIds.forEach(videoId => {
          const m = metricsByVideo[videoId];
          if (m) {
            totalViews += m.view_count || 0;
            totalLikes += m.like_count || 0;
            videosWithMetrics++;
          }
        });

        const avgViews = videosWithMetrics > 0 ? Math.round(totalViews / videosWithMetrics) : 0;
        const engagementRate = totalViews > 0 ? (totalLikes / totalViews * 100).toFixed(2) : "0.00";

        return {
          channelId: status.channel_id,
          channelName: channel?.display_name || 'Unknown',
          networkGroup: channel?.network_group,
          brandCluster: channel?.brand_cluster,
          status: status.status,
          videosRequested: status.videos_requested,
          videosFetched: status.videos_fetched,
          totalVideos: channelVideoIds.length,
          totalViews,
          totalLikes,
          avgViews,
          engagementRate: parseFloat(engagementRate),
          errorMessage: status.error_message,
        };
      });

      return new Response(JSON.stringify(overview), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /videos - Paginated video list with filters
    if (path === '/videos' || path === '/videos/') {
      const scanId = url.searchParams.get('scanId');
      const channelId = url.searchParams.get('channelId');
      const sortBy = url.searchParams.get('sortBy') || 'views';
      const sortOrder = url.searchParams.get('sortOrder') || 'desc';
      const page = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);

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
        return new Response(JSON.stringify({ videos: [], total: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get metrics for this scan
      const { data: metricsData } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count, comment_count')
        .eq('scan_id', targetScanId);

      const videoIds = (metricsData || []).map(m => m.video_id);
      const metricsMap: Record<string, any> = {};
      (metricsData || []).forEach(m => { metricsMap[m.video_id] = m; });

      // Batch fetch videos in chunks of 100 to avoid URL length limits
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        let videosQuery = supabase
          .from('yt_vod_videos')
          .select('*')
          .in('id', chunk);

        if (channelId) {
          videosQuery = videosQuery.eq('channel_id', channelId);
        }

        const { data: chunkVideos, error } = await videosQuery;
        if (error) throw error;
        videos = videos.concat(chunkVideos || []);
      }

      // Get channel info
      const channelIds = [...new Set((videos || []).map(v => v.channel_id))];
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .in('id', channelIds);

      const channelMap: Record<string, any> = {};
      (channels || []).forEach(c => { channelMap[c.id] = c; });

      // Combine and sort
      let combined = (videos || []).map(video => {
        const metrics = metricsMap[video.id] || {};
        const channel = channelMap[video.channel_id];
        const viewCount = metrics.view_count || 0;
        const likeCount = metrics.like_count || 0;
        
        return {
          id: video.id,
          videoId: video.video_id,
          title: video.title,
          description: video.description,
          channelId: video.channel_id,
          channelName: channel?.display_name || 'Unknown',
          networkGroup: channel?.network_group,
          brandCluster: channel?.brand_cluster,
          publishedAt: video.published_at,
          duration: video.duration,
          durationSeconds: video.duration_seconds,
          thumbnailUrl: video.thumbnail_url,
          viewCount,
          likeCount,
          commentCount: metrics.comment_count || 0,
          engagementRate: viewCount > 0 ? (likeCount / viewCount * 100) : 0,
          tags: video.tags || [],
          language: video.language,
          hasCaptions: video.has_captions,
        };
      });

      // Sort
      const sortAsc = sortOrder === 'asc';
      combined.sort((a, b) => {
        let valA, valB;
        switch (sortBy) {
          case 'views': valA = a.viewCount; valB = b.viewCount; break;
          case 'likes': valA = a.likeCount; valB = b.likeCount; break;
          case 'engagement': valA = a.engagementRate; valB = b.engagementRate; break;
          case 'published': valA = new Date(a.publishedAt).getTime(); valB = new Date(b.publishedAt).getTime(); break;
          case 'duration': valA = a.durationSeconds; valB = b.durationSeconds; break;
          default: valA = a.viewCount; valB = b.viewCount;
        }
        return sortAsc ? valA - valB : valB - valA;
      });

      // Paginate
      const total = combined.length;
      const offset = (page - 1) * limit;
      const paginatedVideos = combined.slice(offset, offset + limit);

      return new Response(JSON.stringify({ 
        videos: paginatedVideos, 
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /keywords - Keyword analysis (computed dynamically)
    if (path === '/keywords' || path === '/keywords/') {
      const scanId = url.searchParams.get('scanId');
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);

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

      // Get metrics for this scan
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count')
        .eq('scan_id', targetScanId);

      const videoIds = (metrics || []).map(m => m.video_id);
      const metricsMap = new Map((metrics || []).map(m => [m.video_id, m]));

      // Batch fetch videos in chunks of 100 to avoid URL length limits
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkVideos } = await supabase
          .from('yt_vod_videos')
          .select('id, title')
          .in('id', chunk);
        videos = videos.concat(chunkVideos || []);
      }

      // Extract and aggregate keywords from titles
      const keywordStats = new Map<string, { count: number; totalViews: number; totalLikes: number }>();
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
        const m = metricsMap.get(video.id);
        const views = m?.view_count || 0;
        const likes = m?.like_count || 0;

        const words = video.title
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

        for (const word of words) {
          const current = keywordStats.get(word) || { count: 0, totalViews: 0, totalLikes: 0 };
          current.count += 1;
          current.totalViews += views;
          current.totalLikes += likes;
          keywordStats.set(word, current);
        }
      }

      // Format and sort by avg views
      const formatted = Array.from(keywordStats.entries())
        .filter(([_, stats]) => stats.count >= 2)
        .map(([keyword, stats]) => ({
          keyword,
          usageCount: stats.count,
          totalViews: stats.totalViews,
          avgViews: Math.round(stats.totalViews / stats.count),
          totalLikes: stats.totalLikes,
          avgLikes: Math.round(stats.totalLikes / stats.count),
          avgEngagementRate: stats.totalViews > 0 ? stats.totalLikes / stats.totalViews : 0,
        }))
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, limit);

      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /tags - Tag analysis (computed dynamically)
    if (path === '/tags' || path === '/tags/') {
      const scanId = url.searchParams.get('scanId');
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);

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

      // Get metrics for this scan
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count')
        .eq('scan_id', targetScanId);

      const videoIds = (metrics || []).map(m => m.video_id);
      const metricsMap = new Map((metrics || []).map(m => [m.video_id, m]));

      // Batch fetch videos in chunks of 100 to avoid URL length limits
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkVideos } = await supabase
          .from('yt_vod_videos')
          .select('id, title, tags')
          .in('id', chunk);
        videos = videos.concat(chunkVideos || []);
      }

      // Extract and aggregate tags (hashtags from title + video tags)
      const tagStats = new Map<string, { count: number; totalViews: number; totalLikes: number }>();
      const hashtagRegex = /#[\w]+/g;

      for (const video of videos || []) {
        const m = metricsMap.get(video.id);
        const views = m?.view_count || 0;
        const likes = m?.like_count || 0;

        // Extract hashtags from title
        const titleHashtags = (video.title.match(hashtagRegex) || [])
          .map((t: string) => t.toLowerCase());

        // Get video tags array
        const videoTags = Array.isArray(video.tags) 
          ? video.tags.map((t: string) => t.toLowerCase())
          : [];

        // Combine all tags
        const allTags = [...new Set([...titleHashtags, ...videoTags])];

        for (const tag of allTags) {
          const current = tagStats.get(tag) || { count: 0, totalViews: 0, totalLikes: 0 };
          current.count += 1;
          current.totalViews += views;
          current.totalLikes += likes;
          tagStats.set(tag, current);
        }
      }

      // Format and sort by avg views
      const formatted = Array.from(tagStats.entries())
        .filter(([_, stats]) => stats.count >= 2)
        .map(([tag, stats]) => ({
          tag,
          usageCount: stats.count,
          totalViews: stats.totalViews,
          avgViews: Math.round(stats.totalViews / stats.count),
          totalLikes: stats.totalLikes,
          avgEngagementRate: stats.totalViews > 0 ? stats.totalLikes / stats.totalViews : 0,
        }))
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, limit);

      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /publish-timing - Publish timing analysis
    if (path === '/publish-timing' || path === '/publish-timing/') {
      const scanId = url.searchParams.get('scanId');
      const networkGroup = url.searchParams.get('networkGroup'); // TIMES, COMPETITION, or null for all
      const dateFrom = url.searchParams.get('dateFrom'); // ISO date string
      const dateTo = url.searchParams.get('dateTo'); // ISO date string

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
        return new Response(JSON.stringify({ heatmap: [], hourly: [], daily: [], topSlots: [], channelPatterns: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get metrics for this scan
      const { data: metrics } = await supabase
        .from('yt_vod_metrics')
        .select('video_id, view_count, like_count')
        .eq('scan_id', targetScanId);

      const videoIds = (metrics || []).map(m => m.video_id);
      const metricsMap = new Map((metrics || []).map(m => [m.video_id, m]));

      // Batch fetch videos
      const CHUNK_SIZE = 100;
      let videos: any[] = [];
      for (let i = 0; i < videoIds.length; i += CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkVideos } = await supabase
          .from('yt_vod_videos')
          .select('id, channel_id, published_at, title')
          .in('id', chunk);
        videos = videos.concat(chunkVideos || []);
      }

      // Get channel info
      const channelIds = [...new Set(videos.map(v => v.channel_id))];
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .in('id', channelIds);

      const channelMap: Record<string, any> = {};
      (channels || []).forEach(c => { channelMap[c.id] = c; });

      // Filter by network group and date range
      let filteredVideos = networkGroup
        ? videos.filter(v => channelMap[v.channel_id]?.network_group === networkGroup)
        : videos;

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        filteredVideos = filteredVideos.filter(v => new Date(v.published_at) >= fromDate);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        filteredVideos = filteredVideos.filter(v => new Date(v.published_at) <= toDate);
      }

      // Build heatmap: day_of_week (0=Sun..6=Sat) x hour (0-23)
      const heatmapData: Record<string, { count: number; totalViews: number; totalLikes: number }> = {};
      const hourlyData: Record<number, { count: number; totalViews: number; totalLikes: number }> = {};
      const dailyData: Record<number, { count: number; totalViews: number; totalLikes: number }> = {};
      const channelTimingMap: Record<string, { channelName: string; networkGroup: string; hours: Record<number, number>; totalViews: number; totalLikes: number; videoCount: number }> = {};
      // NEW: per-channel heatmap data
      const perChannelHeatmapData: Record<string, Record<string, { count: number; totalViews: number }>> = {};
      // NEW: competition intensity - track distinct channels per slot
      const slotChannels: Record<string, Set<string>> = {};
      // NEW: daily frequency - per date per channel
      const dailyFreqMap: Record<string, Record<string, number>> = {};
      // NEW: aggregate stats
      let aggTotalViews = 0;
      let aggTotalLikes = 0;

      for (const video of filteredVideos) {
        const m = metricsMap.get(video.id);
        const views = m?.view_count || 0;
        const likes = m?.like_count || 0;
        const pubDate = new Date(video.published_at);
        // Shift to IST (UTC+5:30) before extracting day/hour
        const istDate = new Date(pubDate.getTime() + 5.5 * 60 * 60 * 1000);
        const day = istDate.getUTCDay(); // 0=Sun
        const hour = istDate.getUTCHours();
        const key = `${day}-${hour}`;

        aggTotalViews += views;
        aggTotalLikes += likes;

        // Heatmap
        if (!heatmapData[key]) heatmapData[key] = { count: 0, totalViews: 0, totalLikes: 0 };
        heatmapData[key].count++;
        heatmapData[key].totalViews += views;
        heatmapData[key].totalLikes += likes;

        // Hourly
        if (!hourlyData[hour]) hourlyData[hour] = { count: 0, totalViews: 0, totalLikes: 0 };
        hourlyData[hour].count++;
        hourlyData[hour].totalViews += views;
        hourlyData[hour].totalLikes += likes;

        // Daily
        if (!dailyData[day]) dailyData[day] = { count: 0, totalViews: 0, totalLikes: 0 };
        dailyData[day].count++;
        dailyData[day].totalViews += views;
        dailyData[day].totalLikes += likes;

        // Channel patterns
        const ch = channelMap[video.channel_id];
        if (ch) {
          if (!channelTimingMap[video.channel_id]) {
            channelTimingMap[video.channel_id] = {
              channelName: ch.display_name,
              networkGroup: ch.network_group || 'Unknown',
              hours: {},
              totalViews: 0,
              totalLikes: 0,
              videoCount: 0,
            };
          }
          channelTimingMap[video.channel_id].hours[hour] = (channelTimingMap[video.channel_id].hours[hour] || 0) + 1;
          channelTimingMap[video.channel_id].totalViews += views;
          channelTimingMap[video.channel_id].totalLikes += likes;
          channelTimingMap[video.channel_id].videoCount++;

          // Per-channel heatmap
          if (!perChannelHeatmapData[video.channel_id]) perChannelHeatmapData[video.channel_id] = {};
          if (!perChannelHeatmapData[video.channel_id][key]) perChannelHeatmapData[video.channel_id][key] = { count: 0, totalViews: 0 };
          perChannelHeatmapData[video.channel_id][key].count++;
          perChannelHeatmapData[video.channel_id][key].totalViews += views;

          // Competition intensity - track which channels post in each slot
          if (!slotChannels[key]) slotChannels[key] = new Set();
          slotChannels[key].add(video.channel_id);

          // Daily frequency
          const dateStr = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
          const freqKey = `${dateStr}::${video.channel_id}`;
          if (!dailyFreqMap[dateStr]) dailyFreqMap[dateStr] = {};
          dailyFreqMap[dateStr][video.channel_id] = (dailyFreqMap[dateStr][video.channel_id] || 0) + 1;
        }
      }

      const totalVideos = filteredVideos.length;

      // Format heatmap
      const heatmap = Object.entries(heatmapData).map(([key, stats]) => {
        const [day, hour] = key.split('-').map(Number);
        return {
          day, hour,
          count: stats.count,
          avgViews: stats.count > 0 ? Math.round(stats.totalViews / stats.count) : 0,
          totalViews: stats.totalViews,
        };
      });

      // Format hourly (0-23)
      const hourly = Array.from({ length: 24 }, (_, h) => {
        const s = hourlyData[h] || { count: 0, totalViews: 0, totalLikes: 0 };
        return {
          hour: h,
          count: s.count,
          avgViews: s.count > 0 ? Math.round(s.totalViews / s.count) : 0,
          totalViews: s.totalViews,
          avgEngagement: s.totalViews > 0 ? +(s.totalLikes / s.totalViews * 100).toFixed(2) : 0,
        };
      });

      // Format daily (0=Sun..6=Sat)
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const daily = Array.from({ length: 7 }, (_, d) => {
        const s = dailyData[d] || { count: 0, totalViews: 0, totalLikes: 0 };
        return {
          day: d,
          dayName: dayNames[d],
          count: s.count,
          avgViews: s.count > 0 ? Math.round(s.totalViews / s.count) : 0,
          totalViews: s.totalViews,
          avgEngagement: s.totalViews > 0 ? +(s.totalLikes / s.totalViews * 100).toFixed(2) : 0,
        };
      });

      // Top performing time slots (day+hour combos sorted by avgViews)
      const topSlots = heatmap
        .filter(s => s.count >= 2)
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 20)
        .map(s => ({
          ...s,
          dayName: dayNames[s.day],
          label: `${dayNames[s.day]} ${s.hour.toString().padStart(2, '0')}:00`,
        }));

      // Channel patterns
      const channelPatterns = Object.entries(channelTimingMap)
        .map(([channelId, data]) => {
          const peakHour = Object.entries(data.hours).sort((a, b) => b[1] - a[1])[0];
          return {
            channelId,
            channelName: data.channelName,
            networkGroup: data.networkGroup,
            videoCount: data.videoCount,
            avgViews: data.videoCount > 0 ? Math.round(data.totalViews / data.videoCount) : 0,
            peakHour: peakHour ? Number(peakHour[0]) : null,
            peakHourCount: peakHour ? peakHour[1] : 0,
          };
        })
        .sort((a, b) => b.videoCount - a.videoCount);

      // NEW: Format per-channel heatmaps
      const perChannelHeatmap: Record<string, { day: number; hour: number; count: number; totalViews: number; avgViews: number }[]> = {};
      for (const [chId, slots] of Object.entries(perChannelHeatmapData)) {
        perChannelHeatmap[chId] = Object.entries(slots).map(([key, stats]) => {
          const [day, hour] = key.split('-').map(Number);
          return {
            day, hour,
            count: stats.count,
            totalViews: stats.totalViews,
            avgViews: stats.count > 0 ? Math.round(stats.totalViews / stats.count) : 0,
          };
        });
      }

      // NEW: Competition intensity
      const competitionIntensity = Object.entries(slotChannels).map(([key, channels]) => {
        const [day, hour] = key.split('-').map(Number);
        const h = heatmapData[key];
        return {
          day, hour,
          channelCount: channels.size,
          totalViews: h?.totalViews || 0,
          avgViews: h && h.count > 0 ? Math.round(h.totalViews / h.count) : 0,
        };
      });

      // NEW: Daily frequency
      const dailyFrequency: { date: string; channelId: string; channelName: string; count: number }[] = [];
      for (const [date, channels] of Object.entries(dailyFreqMap)) {
        for (const [chId, count] of Object.entries(channels)) {
          dailyFrequency.push({
            date,
            channelId: chId,
            channelName: channelMap[chId]?.display_name || 'Unknown',
            count,
          });
        }
      }
      dailyFrequency.sort((a, b) => a.date.localeCompare(b.date));

      // NEW: Aggregate stats
      const aggregateStats = {
        totalVideos,
        totalViews: aggTotalViews,
        avgViewsPerVideo: totalVideos > 0 ? Math.round(aggTotalViews / totalVideos) : 0,
        avgEngagement: aggTotalViews > 0 ? +(aggTotalLikes / aggTotalViews * 100).toFixed(2) : 0,
      };

      return new Response(JSON.stringify({
        heatmap, hourly, daily, topSlots, channelPatterns,
        perChannelHeatmap, competitionIntensity, dailyFrequency, aggregateStats,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /scan-health/:id - Detailed scan health
    if (path.startsWith('/scan-health')) {
      const scanId = url.searchParams.get('scanId');

      if (!scanId) {
        return new Response(JSON.stringify({ error: 'scanId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get scan details
      const { data: scan } = await supabase
        .from('yt_vod_scans')
        .select('*')
        .eq('id', scanId)
        .maybeSingle();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get channel statuses
      const { data: channelStatuses } = await supabase
        .from('yt_vod_scan_channel_status')
        .select('*')
        .eq('scan_id', scanId);

      // Get channel names
      const channelIds = (channelStatuses || []).map(s => s.channel_id);
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name')
        .in('id', channelIds);

      const channelMap: Record<string, string> = {};
      (channels || []).forEach(c => { channelMap[c.id] = c.display_name; });

      const formattedChannels = (channelStatuses || []).map(s => ({
        channelId: s.channel_id,
        channelName: channelMap[s.channel_id] || 'Unknown',
        status: s.status,
        videosRequested: s.videos_requested,
        videosFetched: s.videos_fetched,
        errorMessage: s.error_message,
      }));

      return new Response(JSON.stringify({
        scan: {
          id: scan.id,
          createdAt: scan.created_at,
          scanType: scan.scan_type,
          isComplete: scan.is_complete,
          completionReason: scan.completion_reason,
          totalVideosRequested: scan.total_videos_requested,
          totalVideosFetched: scan.total_videos_fetched,
          channelsSucceeded: scan.channels_succeeded,
          channelsFailed: scan.channels_failed,
          channelsPartial: scan.channels_partial,
          apiKeysUsed: scan.api_keys_used,
          apiKeysExhausted: scan.api_keys_exhausted,
        },
        channels: formattedChannels,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('VOD API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
