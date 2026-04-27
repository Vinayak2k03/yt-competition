-- Fix integer overflow for large YouTube view counts
-- Change view_count and like_count from integer to bigint

ALTER TABLE yt_stream_scan_metrics 
  ALTER COLUMN view_count TYPE bigint,
  ALTER COLUMN like_count TYPE bigint;