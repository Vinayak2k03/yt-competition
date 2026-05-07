package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
	"github.com/sociowatch/yt-competition-backend/internal/services"
)

func resolveLatestLiveScanID() string {
	var scan models.YtScan
	db.DB.
		Joins("JOIN yt_stream_scan_metrics ON yt_stream_scan_metrics.scan_id = yt_scans.id").
		Order("yt_scans.created_at desc").
		First(&scan)
	return scan.ID
}

// GET /api/latest-scan
func GetLatestScan(w http.ResponseWriter, r *http.Request) {
	var scan models.YtScan
	err := db.DB.
		Where("id IN (SELECT DISTINCT scan_id FROM yt_stream_scan_metrics)").
		Order("created_at desc").
		First(&scan).Error
	if err != nil {
		jsonOK(w, nil)
		return
	}

	var streamCount int64
	db.DB.Model(&models.YtStreamScanMetric{}).Where("scan_id = ?", scan.ID).Count(&streamCount)

	var newerFailedCount int64
	db.DB.Model(&models.YtScan{}).
		Where("created_at > ? AND id NOT IN (SELECT DISTINCT scan_id FROM yt_stream_scan_metrics)", scan.CreatedAt).
		Count(&newerFailedCount)

	notes := ""
	if scan.Notes != nil {
		notes = *scan.Notes
	}
	jsonOK(w, map[string]any{
		"id":                   scan.ID,
		"created_at":           scan.CreatedAt,
		"notes":                notes,
		"streamCount":          streamCount,
		"hasNewerFailedScans":  newerFailedCount > 0,
		"failedScanCount":      newerFailedCount,
	})
}

// GET /api/overview?scanId=
func GetOverview(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		scanId = resolveLatestLiveScanID()
	}
	if scanId == "" {
		jsonOK(w, []any{})
		return
	}

	var summaries []models.YtScanChannelSummary
	db.DB.Preload("Channel").Where("scan_id = ?", scanId).Order("total_concurrent_views desc").Find(&summaries)

	result := make([]map[string]any, 0, len(summaries))
	for _, s := range summaries {
		ng := "COMPETITION"
		if s.Channel.NetworkGroup != nil {
			ng = *s.Channel.NetworkGroup
		}
		bc := ""
		if s.Channel.BrandCluster != nil {
			bc = *s.Channel.BrandCluster
		}
		result = append(result, map[string]any{
			"channelId":            s.ChannelID,
			"channelName":          s.Channel.DisplayName,
			"networkGroup":         ng,
			"brandCluster":         bc,
			"totalConcurrentViews": s.TotalConcurrentViews,
			"highestConcurrent":    s.HighestConcurrent,
			"numberOfStreams":       s.NumberOfStreams,
			"averagePeakPerStream": s.AveragePeakPerStream,
			"lastSuccessfulScan":   s.CreatedAt.Format(time.RFC3339),
		})
	}
	jsonOK(w, result)
}

// GET /api/top-streams?scanId=
func GetTopStreams(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		scanId = resolveLatestLiveScanID()
	}
	if scanId == "" {
		jsonOK(w, []any{})
		return
	}

	var metrics []models.YtStreamScanMetric
	db.DB.Preload("Stream.Channel").
		Where("scan_id = ?", scanId).
		Order("concurrent_viewers desc").
		Limit(100).
		Find(&metrics)

	result := make([]map[string]any, 0, len(metrics))
	for _, m := range metrics {
		ng := "COMPETITION"
		if m.Stream.Channel.NetworkGroup != nil {
			ng = *m.Stream.Channel.NetworkGroup
		}
		bc := ""
		if m.Stream.Channel.BrandCluster != nil {
			bc = *m.Stream.Channel.BrandCluster
		}
		result = append(result, map[string]any{
			"streamTitle":       m.Stream.Title,
			"videoId":           m.Stream.VideoID,
			"channelName":       m.Stream.Channel.DisplayName,
			"networkGroup":      ng,
			"brandCluster":      bc,
			"concurrentViewers": m.ConcurrentViewers,
			"viewCount":         m.ViewCount,
			"likeCount":         m.LikeCount,
			"isLive":            m.IsLive,
			"firstSeenAt":       m.Stream.CreatedAt.Format(time.RFC3339),
		})
	}
	jsonOK(w, result)
}

// GET /api/title-word-cloud?scanId=
func GetTitleWordCloud(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		scanId = resolveLatestLiveScanID()
	}
	if scanId == "" {
		jsonOK(w, []any{})
		return
	}
	var stats []models.YtScanKeywordStat
	db.DB.Where("scan_id = ?", scanId).Order("avg_concurrent_views desc").Limit(100).Find(&stats)

	result := make([]map[string]any, 0, len(stats))
	for _, s := range stats {
		result = append(result, map[string]any{
			"keyword":              s.Keyword,
			"usageCount":           s.UsageCount,
			"avgConcurrentViews":   s.AvgConcurrentViews,
			"totalConcurrentViews": s.TotalConcurrentViews,
		})
	}
	jsonOK(w, result)
}

// GET /api/hashtag-ranking?scanId=
func GetHashtagRanking(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		scanId = resolveLatestLiveScanID()
	}
	if scanId == "" {
		jsonOK(w, []any{})
		return
	}
	var stats []models.YtScanTagStat
	db.DB.Where("scan_id = ?", scanId).Order("avg_concurrent_views desc").Limit(100).Find(&stats)

	result := make([]map[string]any, 0, len(stats))
	for _, s := range stats {
		result = append(result, map[string]any{
			"tag":                  s.Tag,
			"usageCount":           s.UsageCount,
			"avgConcurrentViews":   s.AvgConcurrentViews,
			"totalConcurrentViews": s.TotalConcurrentViews,
		})
	}
	jsonOK(w, result)
}

// GET /api/channels
func GetLiveChannels(w http.ResponseWriter, r *http.Request) {
	var channels []models.YtChannel
	db.DB.Where("is_active = ?", true).Order("display_name asc").Find(&channels)
	jsonOK(w, channels)
}

// GET /api/scans?startDate=&endDate=&limit=
func GetScans(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 30
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
		if l > 100 {
			l = 100
		}
		limit = l
	}

	tx := db.DB.
		Where("id IN (SELECT DISTINCT scan_id FROM yt_stream_scan_metrics)").
		Order("created_at desc").
		Limit(limit)

	if sd := q.Get("startDate"); sd != "" {
		if t, err := time.Parse(time.RFC3339, sd); err == nil {
			tx = tx.Where("created_at >= ?", t)
		}
	}
	if ed := q.Get("endDate"); ed != "" {
		if t, err := time.Parse(time.RFC3339, ed); err == nil {
			tx = tx.Where("created_at <= ?", t)
		}
	}

	var scans []models.YtScan
	tx.Find(&scans)

	result := make([]map[string]any, 0, len(scans))
	for _, s := range scans {
		var streamCount int64
		db.DB.Model(&models.YtStreamScanMetric{}).Where("scan_id = ?", s.ID).Count(&streamCount)

		var statuses []models.YtScanChannelStatus
		db.DB.Select("status").Where("scan_id = ?", s.ID).Find(&statuses)

		succeeded, failed, partial := 0, 0, 0
		for _, st := range statuses {
			switch st.Status {
			case "success":
				succeeded++
			case "failed":
				failed++
			case "partial":
				partial++
			}
		}
		notes := ""
		if s.Notes != nil {
			notes = *s.Notes
		}
		result = append(result, map[string]any{
			"id":                s.ID,
			"createdAt":         s.CreatedAt.Format(time.RFC3339),
			"notes":             notes,
			"streamCount":       streamCount,
			"channelsSucceeded": succeeded,
			"channelsFailed":    failed,
			"channelsPartial":   partial,
		})
	}
	jsonOK(w, result)
}

// GET /api/scan-health?scanId=
func GetScanHealth(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		jsonError(w, "scanId is required", 400)
		return
	}
	var statuses []models.YtScanChannelStatus
	db.DB.Preload("Channel").Where("scan_id = ?", scanId).Find(&statuses)

	succeeded, failed, partial := 0, 0, 0
	channels := make([]map[string]any, 0, len(statuses))
	for _, s := range statuses {
		switch s.Status {
		case "success":
			succeeded++
		case "failed":
			failed++
		case "partial":
			partial++
		}
		errMsg := ""
		if s.ErrorMessage != nil {
			errMsg = *s.ErrorMessage
		}
		channels = append(channels, map[string]any{
			"channelId":    s.ChannelID,
			"channelName":  s.Channel.DisplayName,
			"status":       s.Status,
			"streamsFound": s.StreamsFound,
			"errorMessage": errMsg,
		})
	}
	jsonOK(w, map[string]any{
		"scanId":            scanId,
		"channelsSucceeded": succeeded,
		"channelsFailed":    failed,
		"channelsPartial":   partial,
		"channels":          channels,
	})
}

// GET /api/scan-progress?scanId=&scanType=&since=
func GetScanProgress(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scanId := q.Get("scanId")
	scanType := q.Get("scanType")
	since := q.Get("since")

	// Auto-detect latest scan
	if scanId == "" && since != "" {
		sinceTime, err := time.Parse(time.RFC3339, since)
		if err != nil {
			sinceTime = time.Now().Add(-1 * time.Hour)
		}
		if scanType == "vod" {
			var scan models.YtVodScan
			db.DB.Where("created_at >= ?", sinceTime).Order("created_at desc").First(&scan)
			scanId = scan.ID
		} else {
			var scan models.YtScan
			db.DB.Where("created_at >= ?", sinceTime).Order("created_at desc").First(&scan)
			scanId = scan.ID
		}
	}

	if scanId == "" {
		jsonOK(w, map[string]any{"channels": []any{}, "detectedScanId": nil})
		return
	}

	if scanType == "vod" {
		var statuses []models.YtVodScanChannelStatus
		db.DB.Preload("Channel").Where("scan_id = ?", scanId).Find(&statuses)
		channels := make([]map[string]any, 0, len(statuses))
		for _, s := range statuses {
			errMsg := ""
			if s.ErrorMessage != nil {
				errMsg = *s.ErrorMessage
			}
			channels = append(channels, map[string]any{
				"channelId":       s.ChannelID,
				"channelName":     s.Channel.DisplayName,
				"status":          s.Status,
				"videosFetched":   s.VideosFetched,
				"videosRequested": s.VideosRequested,
				"errorMessage":    errMsg,
			})
		}
		jsonOK(w, map[string]any{"detectedScanId": scanId, "channels": channels})
	} else {
		var statuses []models.YtScanChannelStatus
		db.DB.Preload("Channel").Where("scan_id = ?", scanId).Find(&statuses)
		channels := make([]map[string]any, 0, len(statuses))
		for _, s := range statuses {
			errMsg := ""
			if s.ErrorMessage != nil {
				errMsg = *s.ErrorMessage
			}
			channels = append(channels, map[string]any{
				"channelId":    s.ChannelID,
				"channelName":  s.Channel.DisplayName,
				"status":       s.Status,
				"streamsFound": s.StreamsFound,
				"errorMessage": errMsg,
			})
		}
		jsonOK(w, map[string]any{"detectedScanId": scanId, "channels": channels})
	}
}

// POST /api/run-scan
func RunScan(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChannelID string `json:"channelId"`
	}
	if r.Body != nil {
		_ = decodeJSON(r, &body)
	}
	result, err := services.RunLiveScan(body.ChannelID)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	jsonOK(w, result)
}
