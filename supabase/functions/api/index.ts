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
    const path = url.pathname.replace('/api', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    if (path === '/latest-scan' || path === '/latest-scan/') {
      // Get recent scans (up to 10) to find one with data
      const { data: recentScans, error: scanError } = await supabase
        .from('yt_scans')
        .select('id, created_at, notes')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (scanError) throw scanError;
      
      if (!recentScans || recentScans.length === 0) {
        return new Response(JSON.stringify(null), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Find the first scan that has actual stream data
      let successfulScan = null;
      let failedScanCount = 0;
      
      for (const scan of recentScans) {
        const { count } = await supabase
          .from('yt_stream_scan_metrics')
          .select('id', { count: 'exact', head: true })
          .eq('scan_id', scan.id);
        
        if (count && count > 0) {
          successfulScan = scan;
          break;
        }
        failedScanCount++;
      }
      
      // If no scan has data, return the latest anyway with warning
      if (!successfulScan) {
        return new Response(JSON.stringify({
          ...recentScans[0],
          hasNewerFailedScans: false,
          failedScanCount: 0,
          streamCount: 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Get stream count for the successful scan
      const { count: streamCount } = await supabase
        .from('yt_stream_scan_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('scan_id', successfulScan.id);
      
      return new Response(JSON.stringify({
        ...successfulScan,
        hasNewerFailedScans: failedScanCount > 0,
        failedScanCount,
        streamCount: streamCount || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/overview' || path === '/overview/') {
      const scanId = url.searchParams.get('scanId');
      
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_scans')
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
      
      const { data, error } = await supabase
        .from('yt_scan_channel_summary')
        .select(`
          total_concurrent_views,
          highest_concurrent,
          number_of_streams,
          average_peak_per_stream,
          channel_id
        `)
        .eq('scan_id', targetScanId)
        .order('total_concurrent_views', { ascending: false });
      
      if (error) throw error;
      
      const channelIds = (data || []).map((r: { channel_id: string }) => r.channel_id);
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .in('id', channelIds);
      
      // Get last successful scan per channel from yt_scan_channel_status
      const { data: channelStatuses } = await supabase
        .from('yt_scan_channel_status')
        .select('channel_id, created_at, status')
        .in('channel_id', channelIds)
        .eq('status', 'success')
        .order('created_at', { ascending: false });
      
      // Get current scan status for each channel
      const { data: currentScanStatuses } = await supabase
        .from('yt_scan_channel_status')
        .select('channel_id, status')
        .eq('scan_id', targetScanId);
      
      // Build map of current scan status per channel
      const currentStatusMap: Record<string, string> = {};
      (currentScanStatuses || []).forEach((s: { channel_id: string; status: string }) => {
        currentStatusMap[s.channel_id] = s.status;
      });
      
      // Build map of last successful scan per channel
      const lastSuccessMap: Record<string, string> = {};
      (channelStatuses || []).forEach((s: { channel_id: string; created_at: string }) => {
        if (!lastSuccessMap[s.channel_id]) {
          lastSuccessMap[s.channel_id] = s.created_at;
        }
      });
      
      const channelMap: Record<string, { display_name: string; network_group: string; brand_cluster: string }> = {};
      (channels || []).forEach((c: { id: string; display_name: string; network_group: string; brand_cluster: string }) => {
        channelMap[c.id] = c;
      });
      
      const formatted = (data || []).map((row: { channel_id: string; total_concurrent_views: number; highest_concurrent: number; number_of_streams: number; average_peak_per_stream: number }) => ({
        channelId: row.channel_id,
        channelName: channelMap[row.channel_id]?.display_name,
        networkGroup: channelMap[row.channel_id]?.network_group,
        brandCluster: channelMap[row.channel_id]?.brand_cluster,
        totalConcurrentViews: row.total_concurrent_views,
        highestConcurrent: row.highest_concurrent,
        numberOfStreams: row.number_of_streams,
        averagePeakPerStream: row.average_peak_per_stream,
        lastSuccessfulScan: lastSuccessMap[row.channel_id] || null,
        isStaleData: currentStatusMap[row.channel_id] === 'failed' || currentStatusMap[row.channel_id] === 'partial',
      }));
      
      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/top-streams' || path === '/top-streams/') {
      const scanId = url.searchParams.get('scanId');
      
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_scans')
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
      
      console.log(`Fetching top-streams for scan: ${targetScanId}`);
      
      const { data: metricsData, error: metricsError } = await supabase
        .from('yt_stream_scan_metrics')
        .select('concurrent_viewers, view_count, like_count, is_live, stream_id')
        .eq('scan_id', targetScanId)
        .order('concurrent_viewers', { ascending: false })
        .limit(1000);
      
      if (metricsError) {
        console.error('Error fetching metrics:', metricsError);
        throw metricsError;
      }
      
      const data = metricsData || [];
      console.log(`Found ${data.length} stream metrics`);
      
      if (data.length === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Deduplicate stream IDs
      const uniqueStreamIds = [...new Set(data.map((r: { stream_id: string }) => r.stream_id))];
      console.log(`Fetching ${uniqueStreamIds.length} unique streams`);
      
      // Batch stream fetches to avoid URL length limits (max ~50 UUIDs per batch)
      const BATCH_SIZE = 50;
      const streamBatches: string[][] = [];
      for (let i = 0; i < uniqueStreamIds.length; i += BATCH_SIZE) {
        streamBatches.push(uniqueStreamIds.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Fetching streams in ${streamBatches.length} batches`);
      
      const allStreams: { id: string; video_id: string; title: string; first_seen_scan_id: string; channel_id: string }[] = [];
      for (const batch of streamBatches) {
        const { data: batchStreams, error: streamsError } = await supabase
          .from('yt_streams')
          .select('id, video_id, title, first_seen_scan_id, channel_id')
          .in('id', batch);
        
        if (streamsError) {
          console.error('Error fetching streams batch:', streamsError);
          throw streamsError;
        }
        
        if (batchStreams) {
          allStreams.push(...batchStreams);
        }
      }
      
      console.log(`Fetched ${allStreams.length} streams total`);
      
      const streamMap: Record<string, { video_id: string; title: string; first_seen_scan_id: string; channel_id: string }> = {};
      allStreams.forEach((s) => {
        streamMap[s.id] = s;
      });
      
      const channelIds = [...new Set(allStreams.map((s) => s.channel_id))];
      
      const { data: channels, error: channelsError } = await supabase
        .from('yt_channels')
        .select('id, display_name, network_group, brand_cluster')
        .in('id', channelIds)
        .limit(1000);
      
      if (channelsError) {
        console.error('Error fetching channels:', channelsError);
        throw channelsError;
      }
      
      const channelMap: Record<string, { display_name: string; network_group: string; brand_cluster: string }> = {};
      (channels || []).forEach((c: { id: string; display_name: string; network_group: string; brand_cluster: string }) => {
        channelMap[c.id] = c;
      });
      
      const scanIds = [...new Set(allStreams.map((s) => s.first_seen_scan_id))];
      
      const { data: scans, error: scansError } = await supabase
        .from('yt_scans')
        .select('id, created_at')
        .in('id', scanIds)
        .limit(1000);
      
      if (scansError) {
        console.error('Error fetching scans:', scansError);
        throw scansError;
      }
      
      const scanTimes: Record<string, string> = {};
      (scans || []).forEach((s: { id: string; created_at: string }) => {
        scanTimes[s.id] = s.created_at;
      });
      
      const formatted = data.map((row: { stream_id: string; concurrent_viewers: number; view_count: number | null; like_count: number | null; is_live: boolean }) => {
        const stream = streamMap[row.stream_id];
        const channel = stream ? channelMap[stream.channel_id] : null;
        return {
          streamTitle: stream?.title ?? null,
          videoId: stream?.video_id ?? null,
          channelName: channel?.display_name ?? null,
          networkGroup: channel?.network_group ?? null,
          brandCluster: channel?.brand_cluster ?? null,
          concurrentViewers: row.concurrent_viewers,
          viewCount: row.view_count,
          likeCount: row.like_count,
          isLive: row.is_live,
          firstSeenAt: stream?.first_seen_scan_id ? scanTimes[stream.first_seen_scan_id] : null,
        };
      });
      
      console.log(`Returning ${formatted.length} formatted streams`);
      
      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/title-word-cloud' || path === '/title-word-cloud/') {
      const scanId = url.searchParams.get('scanId');
      
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_scans')
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
      
      const { data, error } = await supabase
        .from('yt_scan_keyword_stats')
        .select('keyword, usage_count, avg_concurrent_views, total_concurrent_views')
        .eq('scan_id', targetScanId)
        .order('avg_concurrent_views', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      const formatted = (data || []).map((row: { keyword: string; usage_count: number; avg_concurrent_views: number; total_concurrent_views: number }) => ({
        keyword: row.keyword,
        usageCount: row.usage_count,
        avgConcurrentViews: row.avg_concurrent_views,
        totalConcurrentViews: row.total_concurrent_views,
      }));
      
      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/hashtag-ranking' || path === '/hashtag-ranking/') {
      const scanId = url.searchParams.get('scanId');
      
      let targetScanId = scanId;
      if (!targetScanId) {
        const { data: latestScan } = await supabase
          .from('yt_scans')
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
      
      const { data, error } = await supabase
        .from('yt_scan_tag_stats')
        .select('tag, usage_count, avg_concurrent_views, total_concurrent_views')
        .eq('scan_id', targetScanId)
        .order('avg_concurrent_views', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      const formatted = (data || []).map((row: { tag: string; usage_count: number; avg_concurrent_views: number; total_concurrent_views: number }) => ({
        tag: row.tag,
        usageCount: row.usage_count,
        avgConcurrentViews: row.avg_concurrent_views,
        totalConcurrentViews: row.total_concurrent_views,
      }));
      
      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/channels' || path === '/channels/') {
      const { data, error } = await supabase
        .from('yt_channels')
        .select('*')
        .eq('is_active', true)
        .order('display_name');
      
      if (error) throw error;
      
      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/scans' || path === '/scans/') {
      const limit = parseInt(url.searchParams.get('limit') || '30', 10);
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      
      let query = supabase
        .from('yt_scans')
        .select('id, created_at, notes')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      
      const { data: scans, error } = await query;
      
      if (error) throw error;
      
      // Get stream counts for each scan
      const scanIds = (scans || []).map((s: { id: string }) => s.id);
      const { data: metricsCounts } = await supabase
        .from('yt_stream_scan_metrics')
        .select('scan_id')
        .in('scan_id', scanIds);
      
      // Get channel status counts for each scan
      const { data: channelStatuses } = await supabase
        .from('yt_scan_channel_status')
        .select('scan_id, status')
        .in('scan_id', scanIds);
      
      // Count streams per scan
      const countMap: Record<string, number> = {};
      (metricsCounts || []).forEach((m: { scan_id: string }) => {
        countMap[m.scan_id] = (countMap[m.scan_id] || 0) + 1;
      });
      
      // Count channel statuses per scan
      const statusMap: Record<string, { succeeded: number; failed: number; partial: number }> = {};
      (channelStatuses || []).forEach((s: { scan_id: string; status: string }) => {
        if (!statusMap[s.scan_id]) {
          statusMap[s.scan_id] = { succeeded: 0, failed: 0, partial: 0 };
        }
        if (s.status === 'success') statusMap[s.scan_id].succeeded++;
        else if (s.status === 'failed') statusMap[s.scan_id].failed++;
        else if (s.status === 'partial') statusMap[s.scan_id].partial++;
      });
      
      const formatted = (scans || []).map((scan: { id: string; created_at: string; notes: string | null }) => ({
        id: scan.id,
        createdAt: scan.created_at,
        notes: scan.notes,
        streamCount: countMap[scan.id] || 0,
        channelsSucceeded: statusMap[scan.id]?.succeeded || 0,
        channelsFailed: statusMap[scan.id]?.failed || 0,
        channelsPartial: statusMap[scan.id]?.partial || 0,
      }));
      
      return new Response(JSON.stringify(formatted), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (path === '/scan-health' || path === '/scan-health/') {
      const scanId = url.searchParams.get('scanId');
      
      if (!scanId) {
        return new Response(JSON.stringify({ error: 'scanId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Get channel statuses for this scan
      const { data: statuses, error: statusError } = await supabase
        .from('yt_scan_channel_status')
        .select('channel_id, status, streams_found, error_message')
        .eq('scan_id', scanId);
      
      if (statusError) throw statusError;
      
      // Get channel names
      const channelIds = (statuses || []).map((s: { channel_id: string }) => s.channel_id);
      const { data: channels } = await supabase
        .from('yt_channels')
        .select('id, display_name')
        .in('id', channelIds);
      
      const channelMap: Record<string, string> = {};
      (channels || []).forEach((c: { id: string; display_name: string }) => {
        channelMap[c.id] = c.display_name;
      });
      
      const formatted = (statuses || []).map((s: { channel_id: string; status: string; streams_found: number; error_message: string | null }) => ({
        channelId: s.channel_id,
        channelName: channelMap[s.channel_id] || 'Unknown',
        status: s.status,
        streamsFound: s.streams_found,
        errorMessage: s.error_message,
      }));
      
      // Summary counts
      const succeeded = formatted.filter((s: { status: string }) => s.status === 'success').length;
      const failed = formatted.filter((s: { status: string }) => s.status === 'failed').length;
      const partial = formatted.filter((s: { status: string }) => s.status === 'partial').length;
      
      return new Response(JSON.stringify({
        scanId,
        channelsSucceeded: succeeded,
        channelsFailed: failed,
        channelsPartial: partial,
        channels: formatted,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('API error:', error);
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