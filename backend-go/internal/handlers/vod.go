package handlers

import (
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
	"github.com/sociowatch/yt-competition-backend/internal/services"
)

func resolveVodScanId(scanId string) string {
	if scanId != "" {
		return scanId
	}
	var scan models.YtVodScan
	db.DB.Where("total_videos_fetched > 0").Order("created_at desc").First(&scan)
	return scan.ID
}

// GET /vod-api/latest-scan
func GetLatestVodScan(w http.ResponseWriter, r *http.Request) {
	var scan models.YtVodScan
	err := db.DB.Where("total_videos_fetched > 0").Order("created_at desc").First(&scan).Error
	if err != nil {
		jsonOK(w, nil)
		return
	}

	jsonOK(w, map[string]any{
		"id":                 scan.ID,
		"scan_type":          scan.ScanType,
		"created_at":         scan.CreatedAt,
		"is_complete":        scan.IsComplete,
		"is_resumable":       scan.IsResumable,
		"completion_reason":  scan.CompletionReason,
		"total_videos_fetched": scan.TotalVideosFetched,
		"channels_succeeded": scan.ChannelsSucceeded,
		"channels_failed":    scan.ChannelsFailed,
		"channels_partial":   scan.ChannelsPartial,
		"last_processed_channel_index": scan.LastProcessedChannelIndex,
	})
}

// GET /vod-api/scans
func GetVodScans(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}

	var scans []models.YtVodScan
	db.DB.Where("total_videos_fetched > 0").Order("created_at desc").Limit(limit).Find(&scans)

	result := make([]map[string]any, len(scans))
	for i, s := range scans {
		result[i] = map[string]any{
			"id":                 s.ID,
			"scan_type":          s.ScanType,
			"created_at":         s.CreatedAt,
			"is_complete":        s.IsComplete,
			"is_resumable":       s.IsResumable,
			"total_videos_fetched": s.TotalVideosFetched,
			"channels_succeeded": s.ChannelsSucceeded,
			"channels_failed":    s.ChannelsFailed,
			"completion_reason":  s.CompletionReason,
		}
	}
	jsonOK(w, result)
}

// GET /vod-api/overview
func GetVodOverview(w http.ResponseWriter, r *http.Request) {
	scanId := resolveVodScanId(r.URL.Query().Get("scanId"))
	if scanId == "" {
		jsonOK(w, []any{})
		return
	}

	var statuses []models.YtVodScanChannelStatus
	db.DB.Preload("Channel").Where("scan_id = ?", scanId).Find(&statuses)

	type metricWithChannel struct {
		models.YtVodMetric
		VideoChannelID string `gorm:"column:video_channel_id"`
	}
	var results []metricWithChannel
	db.DB.Table("yt_vod_metrics").
		Select("yt_vod_metrics.*, yt_vod_videos.channel_id as video_channel_id").
		Joins("JOIN yt_vod_videos ON yt_vod_videos.id = yt_vod_metrics.video_id").
		Where("yt_vod_metrics.scan_id = ?", scanId).
		Scan(&results)

	log.Printf("VOD: Found %d joined metrics for overview (scan: %s)", len(results), scanId)
	
	channelMetricsMap := make(map[string]map[string]any)
	for _, r := range results {
		chId := r.VideoChannelID
		if chId == "" { continue }
		cur := channelMetricsMap[chId]
		if cur == nil {
			cur = map[string]any{"totalViews": int64(0), "totalLikes": int64(0), "videoCount": 0}
		}
		cur["totalViews"] = cur["totalViews"].(int64) + r.ViewCount
		if r.LikeCount != nil {
			cur["totalLikes"] = cur["totalLikes"].(int64) + *r.LikeCount
		}
		cur["videoCount"] = cur["videoCount"].(int) + 1
		channelMetricsMap[chId] = cur
	}

	result := make([]map[string]any, len(statuses))
	for i, s := range statuses {
		m := channelMetricsMap[s.ChannelID]
		totalViews := int64(0)
		totalLikes := int64(0)
		videoCount := 0
		if m != nil {
			totalViews = m["totalViews"].(int64)
			totalLikes = m["totalLikes"].(int64)
			videoCount = m["videoCount"].(int)
		}

		ng := "COMPETITION"
		if s.Channel.NetworkGroup != nil {
			ng = *s.Channel.NetworkGroup
		}
		bc := ""
		if s.Channel.BrandCluster != nil {
			bc = *s.Channel.BrandCluster
		}

		avgViews := float64(0)
		if videoCount > 0 {
			avgViews = float64(totalViews) / float64(videoCount)
		}
		engagementRate := float64(0)
		if totalViews > 0 {
			engagementRate = (float64(totalLikes) / float64(totalViews)) * 100
		}

		result[i] = map[string]any{
			"channelId":       s.ChannelID,
			"channelName":     s.Channel.DisplayName,
			"networkGroup":    ng,
			"brandCluster":    bc,
			"status":          s.Status,
			"videosFetched":   s.VideosFetched,
			"videosRequested": s.VideosRequested,
			"totalViews":      totalViews,
			"totalLikes":      totalLikes,
			"videoCount":      videoCount,
			"totalVideos":     videoCount,
			"avgViews":        avgViews,
			"engagementRate":  engagementRate,
		}
	}
	jsonOK(w, result)
}

// GET /vod-api/videos
func GetVodVideos(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scanId := resolveVodScanId(q.Get("scanId"))
	channelId := q.Get("channelId")
	sortBy := q.Get("sortBy")
	if sortBy == "" {
		sortBy = "views"
	}
	sortOrder := q.Get("sortOrder")
	if sortOrder != "asc" {
		sortOrder = "desc"
	}

	page := 1
	if p, err := strconv.Atoi(q.Get("page")); err == nil && p > 0 {
		page = p
	}
	limit := 50
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if limit > 100 {
		limit = 100
	}
	skip := (page - 1) * limit

	if scanId == "" {
		jsonOK(w, map[string]any{"videos": []any{}, "total": 0, "page": page, "limit": limit, "hasMore": false, "totalPages": 0})
		return
	}

	order := "m.view_count desc"
	switch sortBy {
	case "likes":
		order = "m.like_count " + sortOrder
	case "published":
		order = "v.published_at " + sortOrder
	case "duration":
		order = "v.duration_seconds " + sortOrder
	case "engagement":
		order = "CAST(m.like_count AS FLOAT) / CAST(NULLIF(m.view_count, 0) AS FLOAT) " + sortOrder
	default:
		order = "m.view_count " + sortOrder
	}

	type videoRow struct {
		MetricID       string     `gorm:"column:metric_id"`
		VideoID        string     `gorm:"column:video_yt_id"`
		Title          string     `gorm:"column:title"`
		ChannelID      string     `gorm:"column:channel_db_id"`
		ChannelName    string     `gorm:"column:channel_name"`
		NetworkGroup   *string    `gorm:"column:network_group"`
		BrandCluster   *string    `gorm:"column:brand_cluster"`
		PublishedAt    time.Time  `gorm:"column:published_at"`
		ThumbnailURL   *string    `gorm:"column:thumbnail_url"`
		Duration       *string    `gorm:"column:duration"`
		DurationSeconds *int      `gorm:"column:duration_seconds"`
		Tags           string     `gorm:"column:tags"`
		ViewCount      int64      `gorm:"column:view_count"`
		LikeCount      *int64     `gorm:"column:like_count"`
		CommentCount   *int64     `gorm:"column:comment_count"`
	}

	var rows []videoRow
	tx := db.DB.Table("yt_vod_metrics m").
		Select(`m.id as metric_id, v.video_id as video_yt_id, v.title, v.channel_id as channel_db_id,
			c.display_name as channel_name, c.network_group, c.brand_cluster,
			v.published_at, v.thumbnail_url, v.duration, v.duration_seconds, v.tags,
			m.view_count, m.like_count, m.comment_count`).
		Joins("JOIN yt_vod_videos v ON v.id = m.video_id").
		Joins("JOIN yt_channels c ON c.id = v.channel_id").
		Where("m.scan_id = ?", scanId)

	if channelId != "" {
		tx = tx.Where("v.channel_id = ?", channelId)
	}

	var total int64
	tx.Count(&total)
	tx.Order(order).Offset(skip).Limit(limit).Scan(&rows)

	videos := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		ng := "COMPETITION"
		if row.NetworkGroup != nil { ng = *row.NetworkGroup }
		bc := ""
		if row.BrandCluster != nil { bc = *row.BrandCluster }
		engagementRate := float64(0)
		if row.ViewCount > 0 && row.LikeCount != nil {
			engagementRate = float64(*row.LikeCount) / float64(row.ViewCount)
		}
		videos = append(videos, map[string]any{
			"videoId":          row.VideoID,
			"title":            row.Title,
			"channelId":        row.ChannelID,
			"channelName":      row.ChannelName,
			"networkGroup":     ng,
			"brandCluster":     bc,
			"publishedAt":      row.PublishedAt,
			"thumbnailUrl":     row.ThumbnailURL,
			"duration":         row.Duration,
			"durationSeconds":  row.DurationSeconds,
			"viewCount":        row.ViewCount,
			"likeCount":        row.LikeCount,
			"commentCount":     row.CommentCount,
			"engagementRate":   engagementRate,
			"tags":             row.Tags,
		})
	}

	totalPages := (int(total) + limit - 1) / limit
	jsonOK(w, map[string]any{
		"videos":     videos,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": totalPages,
		"hasMore":    skip+limit < int(total),
	})
}

// GET /vod-api/keywords
func GetVodKeywords(w http.ResponseWriter, r *http.Request) {
	scanId := resolveVodScanId(r.URL.Query().Get("scanId"))
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}

	if scanId == "" {
		jsonOK(w, []any{})
		return
	}

	var stats []models.YtVodKeywordStat
	db.DB.Where("scan_id = ?", scanId).Order("avg_views desc").Limit(limit).Find(&stats)

	result := make([]map[string]any, len(stats))
	for i, s := range stats {
		eng := 0.0
		if s.AvgEngagementRate != nil { eng = *s.AvgEngagementRate }
		result[i] = map[string]any{
			"keyword":           s.Keyword,
			"usageCount":        s.UsageCount,
			"totalViews":        s.TotalViews,
			"avgViews":          s.AvgViews,
			"totalLikes":        s.TotalLikes,
			"avgLikes":          s.AvgLikes,
			"avgEngagementRate": eng,
		}
	}
	jsonOK(w, result)
}

// GET /vod-api/tags
func GetVodTags(w http.ResponseWriter, r *http.Request) {
	scanId := resolveVodScanId(r.URL.Query().Get("scanId"))
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}

	if scanId == "" {
		jsonOK(w, []any{})
		return
	}

	var stats []models.YtVodTagStat
	db.DB.Where("scan_id = ?", scanId).Order("usage_count desc").Limit(limit).Find(&stats)

	result := make([]map[string]any, len(stats))
	for i, s := range stats {
		eng := 0.0
		if s.AvgEngagementRate != nil { eng = *s.AvgEngagementRate }
		result[i] = map[string]any{
			"tag":               s.Tag,
			"usageCount":        s.UsageCount,
			"totalViews":        s.TotalViews,
			"avgViews":          s.AvgViews,
			"totalLikes":        s.TotalLikes,
			"avgEngagementRate": eng,
		}
	}
	jsonOK(w, result)
}

// GET /vod-api/scan-health?scanId=
func GetVodScanHealth(w http.ResponseWriter, r *http.Request) {
	scanId := r.URL.Query().Get("scanId")
	if scanId == "" {
		jsonError(w, "scanId required", 400)
		return
	}

	var scan models.YtVodScan
	if err := db.DB.Where("id = ?", scanId).First(&scan).Error; err != nil {
		jsonError(w, "Scan not found", 404)
		return
	}

	var statuses []models.YtVodScanChannelStatus
	db.DB.Preload("Channel").Where("scan_id = ?", scanId).Find(&statuses)

	succeeded := 0
	failed := 0
	partial := 0
	pending := 0
	channels := make([]map[string]any, 0, len(statuses))
	for _, s := range statuses {
		switch s.Status {
		case "success":
			succeeded++
		case "failed":
			failed++
		case "partial":
			partial++
		default:
			pending++
		}
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

	jsonOK(w, map[string]any{
		"scanId":             scanId,
		"isComplete":         scan.IsComplete,
		"canResume":          !scan.IsComplete && scan.IsResumable,
		"totalVideosFetched": scan.TotalVideosFetched,
		"channelsSucceeded":  succeeded,
		"channelsFailed":     failed,
		"channelsPartial":    partial,
		"channelsPending":    pending,
		"channels":           channels,
	})
}

// GET /vod-api/publish-timing
func GetPublishTimingData(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scanId := resolveVodScanId(q.Get("scanId"))
	networkGroup := q.Get("networkGroup")
	
	if scanId == "" {
		jsonOK(w, map[string]any{
			"heatmap": []any{}, "hourly": []any{}, "daily": []any{}, "topSlots": []any{},
			"channelPatterns": []any{}, "perChannelHeatmap": map[string]any{},
			"competitionIntensity": []any{}, "dailyFrequency": []any{},
			"aggregateStats": map[string]any{"totalVideos": 0, "totalViews": 0, "avgViewsPerVideo": 0, "avgEngagement": 0},
		})
		return
	}

	type timingRow struct {
		VideoID      string    `gorm:"column:video_id"`
		ChannelID    string    `gorm:"column:channel_id"`
		ChannelName  string    `gorm:"column:display_name"`
		NetworkGroup string    `gorm:"column:network_group"`
		ViewCount    int64     `gorm:"column:view_count"`
		LikeCount    *int64    `gorm:"column:like_count"`
		PublishedAt  time.Time `gorm:"column:published_at"`
	}
	var rows []timingRow
	tx := db.DB.Table("yt_vod_metrics m").
		Select("m.video_id, v.channel_id, c.display_name, c.network_group, m.view_count, m.like_count, v.published_at").
		Joins("JOIN yt_vod_videos v ON v.id = m.video_id").
		Joins("JOIN yt_channels c ON c.id = v.channel_id").
		Where("m.scan_id = ?", scanId)
	if networkGroup != "" {
		normalized := strings.ToUpper(strings.TrimSpace(networkGroup))
		if normalized == "TIMES" {
			tx = tx.Where("UPPER(c.network_group) LIKE ?", "TIMES%")
		} else {
			tx = tx.Where("UPPER(c.network_group) = ?", normalized)
		}
	}
	tx.Scan(&rows)

	type stats struct {
		count      int
		totalViews int64
		totalLikes int64
	}
	heatmap := make(map[string]*stats)
	hourly := make(map[int]*stats)
	daily := make(map[int]*stats)

	type chPattern struct {
		channelId    string
		channelName  string
		networkGroup string
		videoCount   int
		totalViews   int64
		hourlyCount  map[int]int
	}
	chMap := make(map[string]*chPattern)

	type chStats struct {
		count      int
		totalViews int64
	}
	perChannelHM := make(map[string]map[string]*chStats)

	compMap := make(map[string]map[string]bool)
	compStats := make(map[string]*stats)

	type dFreq struct {
		date        string
		channelId   string
		channelName string
		count       int
	}
	freqMap := make(map[string]*dFreq)

	var totalViews, totalLikes int64

	loc, _ := time.LoadLocation("Asia/Kolkata")
	if loc == nil { loc = time.UTC }

	for _, row := range rows {
		d := row.PublishedAt.In(loc)
		day := int(d.Weekday())
		hour := d.Hour()
		dateStr := d.Format("2006-01-02")

		totalViews += row.ViewCount
		if row.LikeCount != nil { totalLikes += *row.LikeCount }

		key := fmt.Sprintf("%d_%d", day, hour)
		if heatmap[key] == nil { heatmap[key] = &stats{} }
		heatmap[key].count++
		heatmap[key].totalViews += row.ViewCount
		if row.LikeCount != nil { heatmap[key].totalLikes += *row.LikeCount }

		if hourly[hour] == nil { hourly[hour] = &stats{} }
		hourly[hour].count++
		hourly[hour].totalViews += row.ViewCount
		if row.LikeCount != nil { hourly[hour].totalLikes += *row.LikeCount }

		if daily[day] == nil { daily[day] = &stats{} }
		daily[day].count++
		daily[day].totalViews += row.ViewCount
		if row.LikeCount != nil { daily[day].totalLikes += *row.LikeCount }

		if chMap[row.ChannelID] == nil {
			chMap[row.ChannelID] = &chPattern{
				channelId: row.ChannelID, channelName: row.ChannelName, networkGroup: row.NetworkGroup, hourlyCount: make(map[int]int),
			}
		}
		chMap[row.ChannelID].videoCount++
		chMap[row.ChannelID].totalViews += row.ViewCount
		chMap[row.ChannelID].hourlyCount[hour]++

		if perChannelHM[row.ChannelID] == nil { perChannelHM[row.ChannelID] = make(map[string]*chStats) }
		if perChannelHM[row.ChannelID][key] == nil { perChannelHM[row.ChannelID][key] = &chStats{} }
		perChannelHM[row.ChannelID][key].count++
		perChannelHM[row.ChannelID][key].totalViews += row.ViewCount

		if compMap[key] == nil { compMap[key] = make(map[string]bool) }
		compMap[key][row.ChannelID] = true
		if compStats[key] == nil { compStats[key] = &stats{} }
		compStats[key].count++
		compStats[key].totalViews += row.ViewCount

		freqKey := fmt.Sprintf("%s_%s", dateStr, row.ChannelID)
		if freqMap[freqKey] == nil {
			freqMap[freqKey] = &dFreq{date: dateStr, channelId: row.ChannelID, channelName: row.ChannelName}
		}
		freqMap[freqKey].count++
	}

	days := []string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}
	
	heatmapArr := make([]map[string]any, 0)
	for key, s := range heatmap {
		var d, h int
		fmt.Sscanf(key, "%d_%d", &d, &h)
		avg := int64(0)
		if s.count > 0 { avg = s.totalViews / int64(s.count) }
		heatmapArr = append(heatmapArr, map[string]any{
			"day": d, "hour": h, "count": s.count, "avgViews": avg, "totalViews": s.totalViews, "label": fmt.Sprintf("%s %02d:00", days[d], h), "dayName": days[d],
		})
	}

	topSlots := make([]map[string]any, len(heatmapArr))
	copy(topSlots, heatmapArr)
	sort.Slice(topSlots, func(i, j int) bool {
		return topSlots[i]["avgViews"].(int64) > topSlots[j]["avgViews"].(int64)
	})
	if len(topSlots) > 10 {
		topSlots = topSlots[:10]
	}

	hourlyArr := make([]map[string]any, 0)
	for h, s := range hourly {
		avg := int64(0)
		if s.count > 0 { avg = s.totalViews / int64(s.count) }
		eng := 0.0
		if s.totalViews > 0 { eng = (float64(s.totalLikes) / float64(s.totalViews)) * 100 }
		hourlyArr = append(hourlyArr, map[string]any{
			"hour": h, "count": s.count, "avgViews": avg, "totalViews": s.totalViews, "avgEngagement": eng,
		})
	}

	dailyArr := make([]map[string]any, 0)
	for d, s := range daily {
		avg := int64(0)
		if s.count > 0 { avg = s.totalViews / int64(s.count) }
		eng := 0.0
		if s.totalViews > 0 { eng = (float64(s.totalLikes) / float64(s.totalViews)) * 100 }
		dailyArr = append(dailyArr, map[string]any{
			"day": d, "dayName": days[d], "count": s.count, "avgViews": avg, "totalViews": s.totalViews, "avgEngagement": eng,
		})
	}

	channelPatterns := make([]map[string]any, 0)
	for _, cp := range chMap {
		avg := int64(0)
		if cp.videoCount > 0 { avg = cp.totalViews / int64(cp.videoCount) }
		peakHour := -1
		peakHourCount := -1
		for h, c := range cp.hourlyCount {
			if c > peakHourCount {
				peakHour = h
				peakHourCount = c
			}
		}
		channelPatterns = append(channelPatterns, map[string]any{
			"channelId": cp.channelId, "channelName": cp.channelName, "networkGroup": cp.networkGroup,
			"videoCount": cp.videoCount, "avgViews": avg, "peakHour": peakHour, "peakHourCount": peakHourCount,
		})
	}

	perChannelHMRes := make(map[string][]map[string]any)
	for chId, hm := range perChannelHM {
		arr := make([]map[string]any, 0)
		for key, s := range hm {
			var d, h int
			fmt.Sscanf(key, "%d_%d", &d, &h)
			avg := int64(0)
			if s.count > 0 { avg = s.totalViews / int64(s.count) }
			arr = append(arr, map[string]any{
				"day": d, "hour": h, "count": s.count, "avgViews": avg, "totalViews": s.totalViews,
			})
		}
		perChannelHMRes[chId] = arr
	}

	competitionIntensity := make([]map[string]any, 0)
	for key, channelsSet := range compMap {
		s := compStats[key]
		var d, h int
		fmt.Sscanf(key, "%d_%d", &d, &h)
		avg := int64(0)
		if s.count > 0 { avg = s.totalViews / int64(s.count) }
		competitionIntensity = append(competitionIntensity, map[string]any{
			"day": d, "hour": h, "channelCount": len(channelsSet), "totalViews": s.totalViews, "avgViews": avg,
		})
	}

	dailyFrequency := make([]map[string]any, 0)
	for _, f := range freqMap {
		dailyFrequency = append(dailyFrequency, map[string]any{
			"date": f.date, "channelId": f.channelId, "channelName": f.channelName, "count": f.count,
		})
	}

	avgViews := int64(0)
	avgEng := 0.0
	if len(rows) > 0 {
		avgViews = totalViews / int64(len(rows))
		if totalViews > 0 {
			avgEng = (float64(totalLikes) / float64(totalViews)) * 100
		}
	}

	jsonOK(w, map[string]any{
		"heatmap": heatmapArr,
		"hourly":  hourlyArr,
		"daily":   dailyArr,
		"topSlots": topSlots,
		"channelPatterns": channelPatterns,
		"perChannelHeatmap": perChannelHMRes,
		"competitionIntensity": competitionIntensity,
		"dailyFrequency": dailyFrequency,
		"aggregateStats": map[string]any{
			"totalVideos":      len(rows),
			"totalViews":       totalViews,
			"avgViewsPerVideo": avgViews,
			"avgEngagement":    avgEng,
		},
	})
}

// POST /vod-api/run-vod-scan
func RunVodScan(w http.ResponseWriter, r *http.Request) {
	log.Printf("API: POST /vod-api/run-vod-scan")
	var body struct {
		ScanType         string `json:"scanType"`
		ChannelId        string `json:"channelId"`
		DailyOnly        bool   `json:"dailyOnly"`
		VideosPerChannel int    `json:"videosPerChannel"`
		ResumeScanId     string `json:"resumeScanId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}

	if body.VideosPerChannel <= 0 {
		body.VideosPerChannel = 50
	}

	result, err := services.RunVodScan(services.VodScanOptions{
		ScanType:         body.ScanType,
		ChannelId:        body.ChannelId,
		DailyOnly:        body.DailyOnly,
		VideosPerChannel: body.VideosPerChannel,
		ResumeScanId:     body.ResumeScanId,
	})
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	log.Printf("VOD_HANDLER_LOG_UNIQUE: Scan result: %+v", result)
	jsonOK(w, result)
}
