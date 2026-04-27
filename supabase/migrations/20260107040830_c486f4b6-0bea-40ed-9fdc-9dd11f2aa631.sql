-- VOD Analysis Module - Database Schema

-- 1. VOD Scans - Master scan tracking
CREATE TABLE public.yt_vod_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scan_type text NOT NULL DEFAULT 'full',
  date_range_start timestamp with time zone,
  date_range_end timestamp with time zone,
  videos_per_channel integer NOT NULL DEFAULT 50,
  total_videos_requested integer NOT NULL DEFAULT 0,
  total_videos_fetched integer NOT NULL DEFAULT 0,
  channels_succeeded integer NOT NULL DEFAULT 0,
  channels_failed integer NOT NULL DEFAULT 0,
  channels_partial integer NOT NULL DEFAULT 0,
  api_keys_used integer NOT NULL DEFAULT 0,
  api_keys_exhausted integer NOT NULL DEFAULT 0,
  is_complete boolean NOT NULL DEFAULT false,
  completion_reason text,
  notes text
);

ALTER TABLE public.yt_vod_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_scans" ON public.yt_vod_scans FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_scans" ON public.yt_vod_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_scans" ON public.yt_vod_scans FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_scans" ON public.yt_vod_scans FOR DELETE USING (true);

-- 2. VOD Videos - Video metadata storage
CREATE TABLE public.yt_vod_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text UNIQUE NOT NULL,
  channel_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  tags jsonb DEFAULT '[]'::jsonb,
  duration text,
  duration_seconds integer,
  language text,
  default_audio_language text,
  category_id text,
  published_at timestamp with time zone NOT NULL,
  thumbnail_url text,
  has_captions boolean DEFAULT false,
  is_licensed_content boolean DEFAULT false,
  privacy_status text,
  first_seen_scan_id uuid NOT NULL,
  last_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_videos" ON public.yt_vod_videos FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_videos" ON public.yt_vod_videos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_videos" ON public.yt_vod_videos FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_videos" ON public.yt_vod_videos FOR DELETE USING (true);

-- 3. VOD Metrics - Point-in-time snapshots
CREATE TABLE public.yt_vod_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  scan_id uuid NOT NULL,
  view_count bigint NOT NULL DEFAULT 0,
  like_count bigint,
  comment_count bigint,
  favorite_count bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_metrics" ON public.yt_vod_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_metrics" ON public.yt_vod_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_metrics" ON public.yt_vod_metrics FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_metrics" ON public.yt_vod_metrics FOR DELETE USING (true);

-- 4. VOD Scan Channel Status - Per-channel results
CREATE TABLE public.yt_vod_scan_channel_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  videos_requested integer NOT NULL DEFAULT 0,
  videos_fetched integer NOT NULL DEFAULT 0,
  error_message text,
  error_type text,
  last_video_published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_scan_channel_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_scan_channel_status" ON public.yt_vod_scan_channel_status FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_scan_channel_status" ON public.yt_vod_scan_channel_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_scan_channel_status" ON public.yt_vod_scan_channel_status FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_scan_channel_status" ON public.yt_vod_scan_channel_status FOR DELETE USING (true);

-- 5. VOD Scan Video Status - Per-video fetch status
CREATE TABLE public.yt_vod_scan_video_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  video_id text NOT NULL,
  channel_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_scan_video_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_scan_video_status" ON public.yt_vod_scan_video_status FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_scan_video_status" ON public.yt_vod_scan_video_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_scan_video_status" ON public.yt_vod_scan_video_status FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_scan_video_status" ON public.yt_vod_scan_video_status FOR DELETE USING (true);

-- 6. VOD Keyword Stats - Aggregated keyword analysis
CREATE TABLE public.yt_vod_keyword_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  keyword text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  total_views bigint NOT NULL DEFAULT 0,
  avg_views bigint NOT NULL DEFAULT 0,
  total_likes bigint NOT NULL DEFAULT 0,
  avg_likes bigint NOT NULL DEFAULT 0,
  avg_engagement_rate decimal,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_keyword_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_keyword_stats" ON public.yt_vod_keyword_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_keyword_stats" ON public.yt_vod_keyword_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_keyword_stats" ON public.yt_vod_keyword_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_keyword_stats" ON public.yt_vod_keyword_stats FOR DELETE USING (true);

-- 7. VOD Tag Stats - Aggregated tag analysis
CREATE TABLE public.yt_vod_tag_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  tag text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  total_views bigint NOT NULL DEFAULT 0,
  avg_views bigint NOT NULL DEFAULT 0,
  total_likes bigint NOT NULL DEFAULT 0,
  avg_engagement_rate decimal,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.yt_vod_tag_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on yt_vod_tag_stats" ON public.yt_vod_tag_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_vod_tag_stats" ON public.yt_vod_tag_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_vod_tag_stats" ON public.yt_vod_tag_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_vod_tag_stats" ON public.yt_vod_tag_stats FOR DELETE USING (true);

-- Performance Indexes
CREATE INDEX idx_yt_vod_videos_channel_published ON public.yt_vod_videos(channel_id, published_at DESC);
CREATE INDEX idx_yt_vod_videos_video_id ON public.yt_vod_videos(video_id);
CREATE INDEX idx_yt_vod_metrics_video_created ON public.yt_vod_metrics(video_id, created_at DESC);
CREATE INDEX idx_yt_vod_metrics_scan ON public.yt_vod_metrics(scan_id);
CREATE INDEX idx_yt_vod_keyword_stats_scan_views ON public.yt_vod_keyword_stats(scan_id, avg_views DESC);
CREATE INDEX idx_yt_vod_tag_stats_scan_count ON public.yt_vod_tag_stats(scan_id, usage_count DESC);
CREATE INDEX idx_yt_vod_scan_channel_status_scan ON public.yt_vod_scan_channel_status(scan_id);
CREATE INDEX idx_yt_vod_scan_video_status_scan ON public.yt_vod_scan_video_status(scan_id);