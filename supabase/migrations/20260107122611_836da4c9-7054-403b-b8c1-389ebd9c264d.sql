-- Add columns for resumable VOD scans
ALTER TABLE yt_vod_scans 
ADD COLUMN IF NOT EXISTS last_processed_channel_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_resumable boolean DEFAULT true;

-- Add uploads_playlist_id to channels for caching (avoid redundant API calls)
ALTER TABLE yt_channels 
ADD COLUMN IF NOT EXISTS uploads_playlist_id text;