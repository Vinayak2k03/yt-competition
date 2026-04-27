-- Create table for YouTube API keys rotation
CREATE TABLE public.yt_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  quota_exceeded_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.yt_api_keys ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on yt_api_keys" ON public.yt_api_keys FOR SELECT USING (true);
CREATE POLICY "Allow public insert on yt_api_keys" ON public.yt_api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on yt_api_keys" ON public.yt_api_keys FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on yt_api_keys" ON public.yt_api_keys FOR DELETE USING (true);