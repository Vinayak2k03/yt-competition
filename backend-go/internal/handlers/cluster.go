package handlers

import (
	"net/http"
	"sort"

	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
	"github.com/sociowatch/yt-competition-backend/internal/services"
)

// POST /cluster-api/verify-channel
func VerifyChannel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		YoutubeURL string `json:"youtube_url"`
	}
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}
	if body.YoutubeURL == "" {
		jsonError(w, "youtube_url is required", 400)
		return
	}

	data, err := services.FetchChannelFromYoutube(body.YoutubeURL)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	jsonOK(w, map[string]any{"channel": data})
}

// GET /cluster-api/clusters
func GetClusters(w http.ResponseWriter, r *http.Request) {
	var channels []models.YtChannel
	db.DB.Where("is_active = ?", true).Find(&channels)

	type clusterCount struct {
		times       int
		competition int
	}
	clusterMap := make(map[string]*clusterCount)

	for _, c := range channels {
		cluster := "Other"
		if c.BrandCluster != nil && *c.BrandCluster != "" {
			cluster = *c.BrandCluster
		}
		
		counts := clusterMap[cluster]
		if counts == nil {
			counts = &clusterCount{}
			clusterMap[cluster] = counts
		}
		
		ng := ""
		if c.NetworkGroup != nil {
			ng = *c.NetworkGroup
		}
		
		if ng == "TIMES" {
			counts.times++
		} else {
			counts.competition++
		}
	}

	type clusterResp struct {
		ID                  string `json:"id"`
		Name                string `json:"name"`
		TimesChannels       int    `json:"timesChannels"`
		CompetitionChannels int    `json:"competitionChannels"`
		TotalChannels       int    `json:"totalChannels"`
	}
	
	result := make([]clusterResp, 0, len(clusterMap))
	for id, counts := range clusterMap {
		result = append(result, clusterResp{
			ID:                  id,
			Name:                id,
			TimesChannels:       counts.times,
			CompetitionChannels: counts.competition,
			TotalChannels:       counts.times + counts.competition,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].TotalChannels > result[j].TotalChannels
	})

	jsonOK(w, result)
}

// GET /cluster-api/summaries
func GetClusterSummaries(w http.ResponseWriter, r *http.Request) {
	targetScanId := r.URL.Query().Get("scanId")
	if targetScanId == "" {
		var latest models.YtVodScan
		db.DB.Order("created_at desc").First(&latest)
		targetScanId = latest.ID
	}
	if targetScanId == "" {
		jsonOK(w, []any{})
		return
	}

	var channels []models.YtChannel
	db.DB.Where("is_active = ?", true).Find(&channels)
	channelMap := make(map[string]models.YtChannel)
	for _, c := range channels {
		channelMap[c.ID] = c
	}

	type metricWithVideo struct {
		models.YtVodMetric
		ChannelID string `gorm:"column:video_channel_id"`
	}
	var joinedMetrics []metricWithVideo
	db.DB.Table("yt_vod_metrics").
		Select("yt_vod_metrics.*, yt_vod_videos.channel_id as video_channel_id").
		Joins("JOIN yt_vod_videos ON yt_vod_videos.id = yt_vod_metrics.video_id").
		Where("yt_vod_metrics.scan_id = ?", targetScanId).
		Scan(&joinedMetrics)

	type clusterStat struct {
		timesViews       int64
		competitionViews int64
		timesLikes       int64
		competitionLikes int64
		timesVideos      int
		competitionVideos int
		topChannelName   string
		topChannelViews  int64
	}
	statsMap := make(map[string]*clusterStat)
	for _, c := range channels {
		cluster := "Other"
		if c.BrandCluster != nil && *c.BrandCluster != "" {
			cluster = *c.BrandCluster
		}
		if statsMap[cluster] == nil {
			statsMap[cluster] = &clusterStat{}
		}
	}

	channelViews := make(map[string]int64)

	for _, m := range joinedMetrics {
		channelId := m.ChannelID
		channel, ok := channelMap[channelId]
		if !ok {
			continue
		}

		cluster := "Other"
		if channel.BrandCluster != nil && *channel.BrandCluster != "" {
			cluster = *channel.BrandCluster
		}
		
		s := statsMap[cluster]

		channelViews[channelId] += m.ViewCount
		
		ng := ""
		if channel.NetworkGroup != nil {
			ng = *channel.NetworkGroup
		}

		if ng == "TIMES" {
			s.timesViews += m.ViewCount
			if m.LikeCount != nil {
				s.timesLikes += *m.LikeCount
			}
			s.timesVideos++
		} else {
			s.competitionViews += m.ViewCount
			if m.LikeCount != nil {
				s.competitionLikes += *m.LikeCount
			}
			s.competitionVideos++
		}
	}

	// Determine top channel for each cluster
	for channelId, views := range channelViews {
		channel := channelMap[channelId]
		cluster := "Other"
		if channel.BrandCluster != nil && *channel.BrandCluster != "" {
			cluster = *channel.BrandCluster
		}
		s := statsMap[cluster]
		if s != nil && views > s.topChannelViews {
			s.topChannelViews = views
			s.topChannelName = channel.DisplayName
		}
	}

	result := make([]map[string]any, 0, len(statsMap))
	for cluster, s := range statsMap {
		totalViews := s.timesViews + s.competitionViews
		timesShare := float64(0)
		if totalViews > 0 {
			timesShare = (float64(s.timesViews) / float64(totalViews)) * 100
		}
		competitionShare := float64(0)
		if totalViews > 0 {
			competitionShare = (float64(s.competitionViews) / float64(totalViews)) * 100
		}

		timesEngagement := float64(0)
		if s.timesViews > 0 {
			timesEngagement = (float64(s.timesLikes) / float64(s.timesViews)) * 100
		}
		competitionEngagement := float64(0)
		if s.competitionViews > 0 {
			competitionEngagement = (float64(s.competitionLikes) / float64(s.competitionViews)) * 100
		}

		leader := "TIE"
		if s.timesViews > s.competitionViews {
			leader = "TIMES"
		} else if s.competitionViews > s.timesViews {
			leader = "COMPETITION"
		}

		result = append(result, map[string]any{
			"cluster":               cluster,
			"timesShare":            timesShare,
			"competitionShare":      competitionShare,
			"timesViews":            s.timesViews,
			"competitionViews":      s.competitionViews,
			"totalViews":            totalViews,
			"timesVideos":           s.timesVideos,
			"competitionVideos":     s.competitionVideos,
			"totalVideos":           s.timesVideos + s.competitionVideos,
			"timesEngagement":       timesEngagement,
			"competitionEngagement": competitionEngagement,
			"leader":                leader,
			"leaderChannel":         s.topChannelName,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i]["totalViews"].(int64) > result[j]["totalViews"].(int64)
	})

	jsonOK(w, result)
}

// GET /cluster-api/analytics
func GetClusterAnalytics(w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		jsonError(w, "cluster is required", 400)
		return
	}
	targetScanId := r.URL.Query().Get("scanId")
	if targetScanId == "" {
		var latest models.YtVodScan
		db.DB.Order("created_at desc").First(&latest)
		targetScanId = latest.ID
	}
	if targetScanId == "" {
		jsonError(w, "No scans found", 404)
		return
	}

	var channels []models.YtChannel
	db.DB.Where("brand_cluster = ? AND is_active = ?", cluster, true).Find(&channels)
	channelMap := make(map[string]models.YtChannel)
	channelIds := make([]string, len(channels))
	for i, c := range channels {
		channelMap[c.ID] = c
		channelIds[i] = c.ID
	}

	type videoWithMetric struct {
		models.YtVodVideo
		ViewCount    int64  `gorm:"column:view_count"`
		LikeCount    *int64 `gorm:"column:like_count"`
		CommentCount *int64 `gorm:"column:comment_count"`
		MetricFound  bool   `gorm:"column:metric_found"`
	}
	var videosWithMetrics []videoWithMetric
	db.DB.Table("yt_vod_videos").
		Select("yt_vod_videos.*, m.view_count, m.like_count, m.comment_count, (m.id IS NOT NULL) as metric_found").
		Joins("LEFT JOIN yt_vod_metrics m ON m.video_id = yt_vod_videos.id AND m.scan_id = ?", targetScanId).
		Where("yt_vod_videos.channel_id IN ?", channelIds).
		Scan(&videosWithMetrics)

	type chanStat struct {
		views      int64
		likes      int64
		videoCount int
	}
	channelStats := make(map[string]*chanStat)
	for _, v := range videosWithMetrics {
		if !v.MetricFound {
			continue
		}
		viewCount := v.ViewCount
		likeCount := v.LikeCount
		s := channelStats[v.ChannelID]
		if s == nil {
			s = &chanStat{}
			channelStats[v.ChannelID] = s
		}
		s.views += viewCount
		if likeCount != nil {
			s.likes += *likeCount
		}
		s.videoCount++
	}

	timesChannels := make([]map[string]any, 0)
	competitionChannels := make([]map[string]any, 0)

	for chId, s := range channelStats {
		channel := channelMap[chId]
		ng := ""
		if channel.NetworkGroup != nil {
			ng = *channel.NetworkGroup
		}
		
		engagement := float64(0)
		if s.views > 0 {
			engagement = (float64(s.likes) / float64(s.views)) * 100
		}

		data := map[string]any{
			"channelId":      chId,
			"channelName":    channel.DisplayName,
			"networkGroup":   ng,
			"totalViews":     s.views,
			"totalLikes":     s.likes,
			"videoCount":     s.videoCount,
			"avgViews":       int64(0),
			"engagementRate": engagement,
		}
		if s.videoCount > 0 {
			data["avgViews"] = s.views / int64(s.videoCount)
		}

		if ng == "TIMES" {
			timesChannels = append(timesChannels, data)
		} else {
			competitionChannels = append(competitionChannels, data)
		}
	}

	sort.Slice(timesChannels, func(i, j int) bool { return timesChannels[i]["totalViews"].(int64) > timesChannels[j]["totalViews"].(int64) })
	sort.Slice(competitionChannels, func(i, j int) bool { return competitionChannels[i]["totalViews"].(int64) > competitionChannels[j]["totalViews"].(int64) })

	for i := range timesChannels { timesChannels[i]["rank"] = i + 1 }
	for i := range competitionChannels { competitionChannels[i]["rank"] = i + 1 }

	// Keyword logic (simplified)
	// ... (Skipping complex word cloud for now, just return empty)

	jsonOK(w, map[string]any{
		"cluster": cluster,
		"timesPerformance": map[string]any{
			"channels": timesChannels,
		},
		"competitionPerformance": map[string]any{
			"channels": competitionChannels,
		},
	})
}
