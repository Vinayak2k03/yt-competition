-- Create yt_channels table - configuration for all channels
CREATE TABLE public.yt_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network_group TEXT NOT NULL CHECK (network_group IN ('TIMES', 'COMPETITION')),
  brand_cluster TEXT NOT NULL,
  display_name TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_channel_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create yt_scans table - one per 30-min snapshot
CREATE TABLE public.yt_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Create yt_streams table - unique YouTube live video ids
CREATE TABLE public.yt_streams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  channel_id UUID NOT NULL REFERENCES public.yt_channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  first_seen_scan_id UUID NOT NULL REFERENCES public.yt_scans(id) ON DELETE CASCADE,
  tags JSONB DEFAULT '[]'::jsonb,
  language TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create yt_stream_scan_metrics table - metrics per scan × stream
CREATE TABLE public.yt_stream_scan_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.yt_scans(id) ON DELETE CASCADE,
  stream_id UUID NOT NULL REFERENCES public.yt_streams(id) ON DELETE CASCADE,
  concurrent_viewers INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER,
  like_count INTEGER,
  is_live BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create yt_scan_channel_summary table - aggregated per scan × channel
CREATE TABLE public.yt_scan_channel_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.yt_scans(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.yt_channels(id) ON DELETE CASCADE,
  total_concurrent_views INTEGER NOT NULL DEFAULT 0,
  highest_concurrent INTEGER NOT NULL DEFAULT 0,
  number_of_streams INTEGER NOT NULL DEFAULT 0,
  average_peak_per_stream INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(scan_id, channel_id)
);

-- Create yt_scan_keyword_stats table - for title word cloud per scan
CREATE TABLE public.yt_scan_keyword_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.yt_scans(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  total_concurrent_views INTEGER NOT NULL DEFAULT 0,
  avg_concurrent_views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(scan_id, keyword)
);

-- Create yt_scan_tag_stats table - for hashtag/tag ranking per scan
CREATE TABLE public.yt_scan_tag_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.yt_scans(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  total_concurrent_views INTEGER NOT NULL DEFAULT 0,
  avg_concurrent_views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(scan_id, tag)
);

-- Create indexes for better performance
CREATE INDEX idx_yt_channels_active ON public.yt_channels(is_active);
CREATE INDEX idx_yt_channels_network_group ON public.yt_channels(network_group);
CREATE INDEX idx_yt_channels_brand_cluster ON public.yt_channels(brand_cluster);
CREATE INDEX idx_yt_scans_created_at ON public.yt_scans(created_at DESC);
CREATE INDEX idx_yt_streams_video_id ON public.yt_streams(video_id);
CREATE INDEX idx_yt_streams_channel_id ON public.yt_streams(channel_id);
CREATE INDEX idx_yt_stream_scan_metrics_scan_id ON public.yt_stream_scan_metrics(scan_id);
CREATE INDEX idx_yt_stream_scan_metrics_stream_id ON public.yt_stream_scan_metrics(stream_id);
CREATE INDEX idx_yt_scan_channel_summary_scan_id ON public.yt_scan_channel_summary(scan_id);
CREATE INDEX idx_yt_scan_keyword_stats_scan_id ON public.yt_scan_keyword_stats(scan_id);
CREATE INDEX idx_yt_scan_tag_stats_scan_id ON public.yt_scan_tag_stats(scan_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_yt_channels_updated_at
  BEFORE UPDATE ON public.yt_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yt_streams_updated_at
  BEFORE UPDATE ON public.yt_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Disable RLS for internal tool (no user authentication needed)
ALTER TABLE public.yt_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_stream_scan_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_scan_channel_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_scan_keyword_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_scan_tag_stats ENABLE ROW LEVEL SECURITY;

-- Create public access policies (internal tool, no auth required)
CREATE POLICY "Allow public read access on yt_channels" ON public.yt_channels FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_channels" ON public.yt_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_channels" ON public.yt_channels FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_channels" ON public.yt_channels FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_scans" ON public.yt_scans FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_scans" ON public.yt_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_scans" ON public.yt_scans FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_scans" ON public.yt_scans FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_streams" ON public.yt_streams FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_streams" ON public.yt_streams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_streams" ON public.yt_streams FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_streams" ON public.yt_streams FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_stream_scan_metrics" ON public.yt_stream_scan_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_stream_scan_metrics" ON public.yt_stream_scan_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_stream_scan_metrics" ON public.yt_stream_scan_metrics FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_stream_scan_metrics" ON public.yt_stream_scan_metrics FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_scan_channel_summary" ON public.yt_scan_channel_summary FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_scan_channel_summary" ON public.yt_scan_channel_summary FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_scan_channel_summary" ON public.yt_scan_channel_summary FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_scan_channel_summary" ON public.yt_scan_channel_summary FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_scan_keyword_stats" ON public.yt_scan_keyword_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_scan_keyword_stats" ON public.yt_scan_keyword_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_scan_keyword_stats" ON public.yt_scan_keyword_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_scan_keyword_stats" ON public.yt_scan_keyword_stats FOR DELETE USING (true);

CREATE POLICY "Allow public read access on yt_scan_tag_stats" ON public.yt_scan_tag_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_scan_tag_stats" ON public.yt_scan_tag_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_scan_tag_stats" ON public.yt_scan_tag_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_scan_tag_stats" ON public.yt_scan_tag_stats FOR DELETE USING (true);