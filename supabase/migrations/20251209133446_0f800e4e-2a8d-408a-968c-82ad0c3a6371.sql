-- Add error tracking columns to yt_api_keys
ALTER TABLE public.yt_api_keys 
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS last_error_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS error_type text,
ADD COLUMN IF NOT EXISTS consecutive_errors integer NOT NULL DEFAULT 0;

-- Create yt_scan_channel_status table for per-channel scan tracking
CREATE TABLE IF NOT EXISTS public.yt_scan_channel_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  streams_found integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('success', 'failed', 'partial', 'pending'))
);

-- Enable RLS
ALTER TABLE public.yt_scan_channel_status ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read access on yt_scan_channel_status" 
ON public.yt_scan_channel_status 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on yt_scan_channel_status" 
ON public.yt_scan_channel_status 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on yt_scan_channel_status" 
ON public.yt_scan_channel_status 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete on yt_scan_channel_status" 
ON public.yt_scan_channel_status 
FOR DELETE 
USING (true);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_channel_status_scan_id ON public.yt_scan_channel_status(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_channel_status_channel_id ON public.yt_scan_channel_status(channel_id);