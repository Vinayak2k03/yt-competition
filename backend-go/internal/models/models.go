package models

import (
	"time"
)

// YtChannel maps to yt_channels table
type YtChannel struct {
	ID                string     `gorm:"primaryKey;column:id" json:"id"`
	NetworkGroup      *string    `gorm:"column:network_group" json:"network_group"`
	BrandCluster      *string    `gorm:"column:brand_cluster" json:"brand_cluster"`
	DisplayName       string     `gorm:"column:display_name;not null" json:"display_name"`
	YoutubeURL        string     `gorm:"column:youtube_url;not null" json:"youtube_url"`
	YoutubeChannelID  *string    `gorm:"column:youtube_channel_id" json:"youtube_channel_id"`
	UploadsPlaylistID *string    `gorm:"column:uploads_playlist_id" json:"uploads_playlist_id"`
	IsActive          bool       `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt         time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (YtChannel) TableName() string { return "yt_channels" }

// YtApiKey maps to yt_api_keys table
type YtApiKey struct {
	ID                string     `gorm:"primaryKey;column:id" json:"id"`
	ApiKey            string     `gorm:"column:api_key;not null" json:"api_key"`
	Name              string     `gorm:"column:name;not null" json:"name"`
	IsActive          bool       `gorm:"column:is_active;default:true" json:"is_active"`
	DailyQuota        int        `gorm:"column:daily_quota;default:10000" json:"daily_quota"`
	QuotaExceededAt   *time.Time `gorm:"column:quota_exceeded_at" json:"quota_exceeded_at"`
	LastUsedAt        *time.Time `gorm:"column:last_used_at" json:"last_used_at"`
	LastError         *string    `gorm:"column:last_error" json:"last_error"`
	LastErrorAt       *time.Time `gorm:"column:last_error_at" json:"last_error_at"`
	ErrorType         *string    `gorm:"column:error_type" json:"error_type"`
	ConsecutiveErrors int        `gorm:"column:consecutive_errors;default:0" json:"consecutive_errors"`
	CreatedAt         time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtApiKey) TableName() string { return "yt_api_keys" }

// YtScan maps to yt_scans table
type YtScan struct {
	ID        string    `gorm:"primaryKey;column:id" json:"id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Notes     *string   `gorm:"column:notes" json:"notes"`
}

func (YtScan) TableName() string { return "yt_scans" }

// YtStream maps to yt_streams table
type YtStream struct {
	ID             string    `gorm:"primaryKey;column:id" json:"id"`
	VideoID        string    `gorm:"column:video_id;unique;not null" json:"video_id"`
	ChannelID      string    `gorm:"column:channel_id;not null" json:"channel_id"`
	Title          string    `gorm:"column:title;not null" json:"title"`
	Description    *string   `gorm:"column:description" json:"description"`
	FirstSeenScanID string   `gorm:"column:first_seen_scan_id;not null" json:"first_seen_scan_id"`
	Tags           string    `gorm:"column:tags;default:'[]'" json:"tags"`
	Language       *string   `gorm:"column:language" json:"language"`
	CreatedAt      time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
	Channel        YtChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}

func (YtStream) TableName() string { return "yt_streams" }

// YtStreamScanMetric maps to yt_stream_scan_metrics table
type YtStreamScanMetric struct {
	ID               string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID           string    `gorm:"column:scan_id;not null" json:"scan_id"`
	StreamID         string    `gorm:"column:stream_id;not null" json:"stream_id"`
	ConcurrentViewers int      `gorm:"column:concurrent_viewers;default:0" json:"concurrent_viewers"`
	ViewCount        *int64    `gorm:"column:view_count" json:"view_count"`
	LikeCount        *int64    `gorm:"column:like_count" json:"like_count"`
	IsLive           bool      `gorm:"column:is_live;default:true" json:"is_live"`
	CreatedAt        time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Stream           YtStream  `gorm:"foreignKey:StreamID" json:"stream,omitempty"`
}

func (YtStreamScanMetric) TableName() string { return "yt_stream_scan_metrics" }

// YtScanChannelSummary maps to yt_scan_channel_summary table
type YtScanChannelSummary struct {
	ID                  string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID              string    `gorm:"column:scan_id;not null" json:"scan_id"`
	ChannelID           string    `gorm:"column:channel_id;not null" json:"channel_id"`
	TotalConcurrentViews int      `gorm:"column:total_concurrent_views;default:0" json:"total_concurrent_views"`
	HighestConcurrent   int       `gorm:"column:highest_concurrent;default:0" json:"highest_concurrent"`
	NumberOfStreams      int       `gorm:"column:number_of_streams;default:0" json:"number_of_streams"`
	AveragePeakPerStream int      `gorm:"column:average_peak_per_stream;default:0" json:"average_peak_per_stream"`
	CreatedAt           time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Channel             YtChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}

func (YtScanChannelSummary) TableName() string { return "yt_scan_channel_summary" }

// YtScanKeywordStat maps to yt_scan_keyword_stats table
type YtScanKeywordStat struct {
	ID                  string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID              string    `gorm:"column:scan_id;not null" json:"scan_id"`
	Keyword             string    `gorm:"column:keyword;not null" json:"keyword"`
	UsageCount          int       `gorm:"column:usage_count;default:0" json:"usage_count"`
	TotalConcurrentViews int      `gorm:"column:total_concurrent_views;default:0" json:"total_concurrent_views"`
	AvgConcurrentViews  int       `gorm:"column:avg_concurrent_views;default:0" json:"avg_concurrent_views"`
	CreatedAt           time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtScanKeywordStat) TableName() string { return "yt_scan_keyword_stats" }

// YtScanTagStat maps to yt_scan_tag_stats table
type YtScanTagStat struct {
	ID                  string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID              string    `gorm:"column:scan_id;not null" json:"scan_id"`
	Tag                 string    `gorm:"column:tag;not null" json:"tag"`
	UsageCount          int       `gorm:"column:usage_count;default:0" json:"usage_count"`
	TotalConcurrentViews int      `gorm:"column:total_concurrent_views;default:0" json:"total_concurrent_views"`
	AvgConcurrentViews  int       `gorm:"column:avg_concurrent_views;default:0" json:"avg_concurrent_views"`
	CreatedAt           time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtScanTagStat) TableName() string { return "yt_scan_tag_stats" }

// YtScanChannelStatus maps to yt_scan_channel_status table
type YtScanChannelStatus struct {
	ID           string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID       string    `gorm:"column:scan_id;not null" json:"scan_id"`
	ChannelID    string    `gorm:"column:channel_id;not null" json:"channel_id"`
	Status       string    `gorm:"column:status;default:'pending'" json:"status"`
	StreamsFound int       `gorm:"column:streams_found;default:0" json:"streams_found"`
	ErrorMessage *string   `gorm:"column:error_message" json:"error_message"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Channel      YtChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}

func (YtScanChannelStatus) TableName() string { return "yt_scan_channel_status" }

// YtVodScan maps to yt_vod_scans table
type YtVodScan struct {
	ID                        string     `gorm:"primaryKey;column:id" json:"id"`
	CreatedAt                 time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	ScanType                  string     `gorm:"column:scan_type;default:'full'" json:"scan_type"`
	DateRangeStart            *time.Time `gorm:"column:date_range_start" json:"date_range_start"`
	DateRangeEnd              *time.Time `gorm:"column:date_range_end" json:"date_range_end"`
	VideosPerChannel          int        `gorm:"column:videos_per_channel;default:50" json:"videos_per_channel"`
	TotalVideosRequested      int        `gorm:"column:total_videos_requested;default:0" json:"total_videos_requested"`
	TotalVideosFetched        int        `gorm:"column:total_videos_fetched;default:0" json:"total_videos_fetched"`
	ChannelsSucceeded         int        `gorm:"column:channels_succeeded;default:0" json:"channels_succeeded"`
	ChannelsFailed            int        `gorm:"column:channels_failed;default:0" json:"channels_failed"`
	ChannelsPartial           int        `gorm:"column:channels_partial;default:0" json:"channels_partial"`
	ApiKeysUsed               int        `gorm:"column:api_keys_used;default:0" json:"api_keys_used"`
	ApiKeysExhausted          int        `gorm:"column:api_keys_exhausted;default:0" json:"api_keys_exhausted"`
	IsComplete                bool       `gorm:"column:is_complete;default:false" json:"is_complete"`
	IsResumable               bool       `gorm:"column:is_resumable;default:true" json:"is_resumable"`
	LastProcessedChannelIndex int        `gorm:"column:last_processed_channel_index;default:0" json:"last_processed_channel_index"`
	CompletionReason          *string    `gorm:"column:completion_reason" json:"completion_reason"`
	Notes                     *string    `gorm:"column:notes" json:"notes"`
}

func (YtVodScan) TableName() string { return "yt_vod_scans" }

// YtVodVideo maps to yt_vod_videos table
type YtVodVideo struct {
	ID                   string     `gorm:"primaryKey;column:id" json:"id"`
	VideoID              string     `gorm:"column:video_id;unique;not null" json:"video_id"`
	ChannelID            string     `gorm:"column:channel_id;not null" json:"channel_id"`
	Title                string     `gorm:"column:title;not null" json:"title"`
	Description          *string    `gorm:"column:description" json:"description"`
	Tags                 string     `gorm:"column:tags;default:'[]'" json:"tags"`
	Duration             *string    `gorm:"column:duration" json:"duration"`
	DurationSeconds      *int       `gorm:"column:duration_seconds" json:"duration_seconds"`
	Language             *string    `gorm:"column:language" json:"language"`
	DefaultAudioLanguage *string    `gorm:"column:default_audio_language" json:"default_audio_language"`
	CategoryID           *string    `gorm:"column:category_id" json:"category_id"`
	PublishedAt          time.Time  `gorm:"column:published_at;not null" json:"published_at"`
	ThumbnailURL         *string    `gorm:"column:thumbnail_url" json:"thumbnail_url"`
	HasCaptions          bool       `gorm:"column:has_captions;default:false" json:"has_captions"`
	IsLicensedContent    bool       `gorm:"column:is_licensed_content;default:false" json:"is_licensed_content"`
	PrivacyStatus        *string    `gorm:"column:privacy_status" json:"privacy_status"`
	FirstSeenScanID      string     `gorm:"column:first_seen_scan_id;not null" json:"first_seen_scan_id"`
	LastUpdatedAt        time.Time  `gorm:"column:last_updated_at;autoUpdateTime" json:"last_updated_at"`
	IsDeleted            bool       `gorm:"column:is_deleted;default:false" json:"is_deleted"`
	CreatedAt            time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Channel              YtChannel  `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
	Metrics              []YtVodMetric `gorm:"foreignKey:VideoID;references:ID" json:"metrics,omitempty"`
}

func (YtVodVideo) TableName() string { return "yt_vod_videos" }

// YtVodMetric maps to yt_vod_metrics table
type YtVodMetric struct {
	ID            string     `gorm:"primaryKey;column:id" json:"id"`
	VideoID       string     `gorm:"column:video_id;not null" json:"video_id"`
	ScanID        string     `gorm:"column:scan_id;not null" json:"scan_id"`
	ViewCount     int64      `gorm:"column:view_count;default:0" json:"view_count"`
	LikeCount     *int64     `gorm:"column:like_count" json:"like_count"`
	CommentCount  *int64     `gorm:"column:comment_count" json:"comment_count"`
	FavoriteCount *int64     `gorm:"column:favorite_count" json:"favorite_count"`
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Video         YtVodVideo `gorm:"foreignKey:VideoID;references:ID" json:"video,omitempty"`
}

func (YtVodMetric) TableName() string { return "yt_vod_metrics" }

// YtVodScanChannelStatus maps to yt_vod_scan_channel_status table
type YtVodScanChannelStatus struct {
	ID                   string     `gorm:"primaryKey;column:id" json:"id"`
	ScanID               string     `gorm:"column:scan_id;not null" json:"scan_id"`
	ChannelID            string     `gorm:"column:channel_id;not null" json:"channel_id"`
	Status               string     `gorm:"column:status;default:'pending'" json:"status"`
	VideosRequested      int        `gorm:"column:videos_requested;default:0" json:"videos_requested"`
	VideosFetched        int        `gorm:"column:videos_fetched;default:0" json:"videos_fetched"`
	ErrorMessage         *string    `gorm:"column:error_message" json:"error_message"`
	ErrorType            *string    `gorm:"column:error_type" json:"error_type"`
	LastVideoPublishedAt *time.Time `gorm:"column:last_video_published_at" json:"last_video_published_at"`
	CreatedAt            time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	Channel              YtChannel  `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}

func (YtVodScanChannelStatus) TableName() string { return "yt_vod_scan_channel_status" }

// YtVodScanVideoStatus maps to yt_vod_scan_video_status table
type YtVodScanVideoStatus struct {
	ID           string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID       string    `gorm:"column:scan_id;not null" json:"scan_id"`
	VideoID      string    `gorm:"column:video_id;not null" json:"video_id"`
	ChannelID    string    `gorm:"column:channel_id;not null" json:"channel_id"`
	Status       string    `gorm:"column:status;default:'pending'" json:"status"`
	ErrorMessage *string   `gorm:"column:error_message" json:"error_message"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtVodScanVideoStatus) TableName() string { return "yt_vod_scan_video_status" }

// YtVodKeywordStat maps to yt_vod_keyword_stats table
type YtVodKeywordStat struct {
	ID               string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID           string    `gorm:"column:scan_id;not null" json:"scan_id"`
	Keyword          string    `gorm:"column:keyword;not null" json:"keyword"`
	UsageCount       int       `gorm:"column:usage_count;default:0" json:"usage_count"`
	TotalViews       int64     `gorm:"column:total_views;default:0" json:"total_views"`
	AvgViews         int64     `gorm:"column:avg_views;default:0" json:"avg_views"`
	TotalLikes       int64     `gorm:"column:total_likes;default:0" json:"total_likes"`
	AvgLikes         int64     `gorm:"column:avg_likes;default:0" json:"avg_likes"`
	AvgEngagementRate *float64 `gorm:"column:avg_engagement_rate" json:"avg_engagement_rate"`
	CreatedAt        time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtVodKeywordStat) TableName() string { return "yt_vod_keyword_stats" }

// YtVodTagStat maps to yt_vod_tag_stats table
type YtVodTagStat struct {
	ID               string    `gorm:"primaryKey;column:id" json:"id"`
	ScanID           string    `gorm:"column:scan_id;not null" json:"scan_id"`
	Tag              string    `gorm:"column:tag;not null" json:"tag"`
	UsageCount       int       `gorm:"column:usage_count;default:0" json:"usage_count"`
	TotalViews       int64     `gorm:"column:total_views;default:0" json:"total_views"`
	AvgViews         int64     `gorm:"column:avg_views;default:0" json:"avg_views"`
	TotalLikes       int64     `gorm:"column:total_likes;default:0" json:"total_likes"`
	AvgEngagementRate *float64 `gorm:"column:avg_engagement_rate" json:"avg_engagement_rate"`
	CreatedAt        time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (YtVodTagStat) TableName() string { return "yt_vod_tag_stats" }
