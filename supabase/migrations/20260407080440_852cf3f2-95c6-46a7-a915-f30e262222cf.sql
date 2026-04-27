
-- Step 1: Deduplicate yt_vod_scan_channel_status
DELETE FROM yt_vod_scan_channel_status a
USING yt_vod_scan_channel_status b
WHERE a.id > b.id
  AND a.scan_id = b.scan_id
  AND a.channel_id = b.channel_id;

-- Step 2: Add unique constraint on yt_vod_scan_channel_status
ALTER TABLE yt_vod_scan_channel_status
  ADD CONSTRAINT uq_vod_scan_channel UNIQUE (scan_id, channel_id);

-- Step 3: Deduplicate yt_vod_scan_video_status
DELETE FROM yt_vod_scan_video_status a
USING yt_vod_scan_video_status b
WHERE a.id > b.id
  AND a.scan_id = b.scan_id
  AND a.video_id = b.video_id;

-- Step 4: Add unique constraint on yt_vod_scan_video_status
ALTER TABLE yt_vod_scan_video_status
  ADD CONSTRAINT uq_vod_scan_video UNIQUE (scan_id, video_id);

-- Step 5: Deduplicate yt_vod_metrics
DELETE FROM yt_vod_metrics a
USING yt_vod_metrics b
WHERE a.id > b.id
  AND a.scan_id = b.scan_id
  AND a.video_id = b.video_id;

-- Step 6: Add unique constraint on yt_vod_metrics
ALTER TABLE yt_vod_metrics
  ADD CONSTRAINT uq_vod_metrics UNIQUE (scan_id, video_id);
