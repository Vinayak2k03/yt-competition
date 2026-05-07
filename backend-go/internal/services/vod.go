package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
)

type VodScanOptions struct {
	ScanType         string `json:"scanType"`
	ChannelId        string `json:"channelId"`
	DailyOnly        bool   `json:"dailyOnly"`
	VideosPerChannel int    `json:"videosPerChannel"`
	ResumeScanId     string `json:"resumeScanId"`
}

func parseDuration(duration string) int {
	if duration == "" {
		return 0
	}
	re := regexp.MustCompile(`PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?`)
	m := re.FindStringSubmatch(duration)
	if m == nil {
		return 0
	}
	h := 0
	if m[1] != "" {
		fmt.Sscanf(m[1], "%d", &h)
	}
	min := 0
	if m[2] != "" {
		fmt.Sscanf(m[2], "%d", &min)
	}
	s := 0
	if m[3] != "" {
		fmt.Sscanf(m[3], "%d", &s)
	}
	return h*3600 + min*60 + s
}

func upsertVodChannelStatus(scanId, channelId, status string, requested, fetched int, errorMessage *string, lastPublished *time.Time) {
	var existing models.YtVodScanChannelStatus
	err := db.DB.Where("scan_id = ? AND channel_id = ?", scanId, channelId).First(&existing).Error
	
	if err == nil {
		db.DB.Model(&existing).Updates(map[string]interface{}{
			"status":                   status,
			"videos_fetched":           fetched,
			"error_message":            errorMessage,
			"last_video_published_at": lastPublished,
		})
	} else {
		db.DB.Create(&models.YtVodScanChannelStatus{
			ID:                   uuid.New().String(),
			ScanID:               scanId,
			ChannelID:            channelId,
			Status:               status,
			VideosRequested:      requested,
			VideosFetched:        fetched,
			ErrorMessage:         errorMessage,
			LastVideoPublishedAt: lastPublished,
		})
	}
}

func RunVodScan(opts VodScanOptions) (map[string]any, error) {
	
	km := NewApiKeyManager()
	if err := km.LoadKeys(); err != nil {
		return nil, err
	}

	dailyCutoff := time.Now().Add(-48 * time.Hour)
	
	var scan models.YtVodScan
	if opts.ResumeScanId != "" {
		if err := db.DB.Where("id = ?", opts.ResumeScanId).First(&scan).Error; err != nil {
			return nil, err
		}
		if scan.IsComplete {
			return map[string]any{
				"success": true, 
				"scanId": scan.ID, 
				"message": "Scan already complete",
				"summary": map[string]any{
					"videosFetched":     scan.TotalVideosFetched,
					"channelsProcessed": scan.ChannelsSucceeded + scan.ChannelsFailed,
					"channelsTotal":     scan.ChannelsSucceeded + scan.ChannelsFailed, // Approximate
				},
			}, nil
		}
	} else {
		scan = models.YtVodScan{
			ID:               uuid.New().String(),
			ScanType:         opts.ScanType,
			VideosPerChannel: opts.VideosPerChannel,
			IsResumable:      true,
			DateRangeStart:   &dailyCutoff,
		}
		if opts.DailyOnly {
			now := time.Now()
			scan.DateRangeEnd = &now
		}
		db.DB.Create(&scan)
	}

	var rawChannels []models.YtChannel
	query := db.DB.Where("is_active = ?", true)
	if opts.ChannelId != "" {
		query = query.Where("id = ?", opts.ChannelId)
	}
	query.Find(&rawChannels)
	log.Printf("VOD: Found %d channels in DB", len(rawChannels))

	// Resolve missing IDs
	for i := range rawChannels {
		if rawChannels[i].YoutubeChannelID == nil || *rawChannels[i].YoutubeChannelID == "" {
			log.Printf("VOD: Resolving ID for %s", rawChannels[i].DisplayName)
			resolved, err := resolveChannelIdFromUrl(km, rawChannels[i].YoutubeURL)
			if err == nil && resolved != "" {
				db.DB.Model(&rawChannels[i]).Update("youtube_channel_id", resolved)
				rawChannels[i].YoutubeChannelID = &resolved
			} else {
				log.Printf("VOD: Failed to resolve ID for %s: %v", rawChannels[i].DisplayName, err)
			}
		}
	}

	// Filter valid ones
	var channels []models.YtChannel
	for _, ch := range rawChannels {
		if ch.YoutubeChannelID != nil && *ch.YoutubeChannelID != "" {
			channels = append(channels, ch)
		}
	}

	if opts.ResumeScanId == "" {
		for _, ch := range channels {
			upsertVodChannelStatus(scan.ID, ch.ID, "pending", opts.VideosPerChannel, 0, nil, nil)
		}
	}

	totalFetched := 0
	channelsSucceeded := 0
	channelsFailed := 0

	for i := scan.LastProcessedChannelIndex; i < len(channels); i++ {
		ch := channels[i]
		log.Printf("VOD: Processing %s [%d/%d]", ch.DisplayName, i+1, len(channels))
		
		fetched, err := processVodChannel(km, ch, scan.ID, opts.VideosPerChannel, dailyCutoff)
		totalFetched += fetched
		if err == nil {
			channelsSucceeded++
		} else {
			channelsFailed++
		}

		// Update scan progress
		db.DB.Model(&scan).Updates(map[string]interface{}{
			"total_videos_fetched":         totalFetched,
			"channels_succeeded":           channelsSucceeded,
			"channels_failed":              channelsFailed,
			"last_processed_channel_index": i + 1,
		})
	}

	// Final Aggregation
	if totalFetched > 0 {
		log.Printf("VOD: Aggregating keyword/tag stats for scan %s", scan.ID)
		aggregateVodStats(scan.ID)
	}

	db.DB.Model(&scan).Update("is_complete", true)

	return map[string]any{
		"success":            true,
		"scanId":             scan.ID,
		"totalVideosFetched": totalFetched,
		"isComplete":         true,
		"summary": map[string]any{
			"videosFetched":     totalFetched,
			"channelsProcessed": channelsSucceeded + channelsFailed,
			"channelsTotal":     len(channels),
		},
	}, nil
}

func aggregateVodStats(scanId string) {
	type metricWithTitle struct {
		models.YtVodMetric
		VideoTitle string `gorm:"column:video_title"`
		VideoTags  string `gorm:"column:video_tags"`
	}
	var joined []metricWithTitle
	db.DB.Table("yt_vod_metrics").
		Select("yt_vod_metrics.*, yt_vod_videos.title as video_title, yt_vod_videos.tags as video_tags").
		Joins("JOIN yt_vod_videos ON yt_vod_videos.id = yt_vod_metrics.video_id").
		Where("yt_vod_metrics.scan_id = ?", scanId).
		Scan(&joined)
	log.Printf("VOD aggregateStats: loaded %d joined metrics", len(joined))
	
	var metrics []models.YtVodMetric
	for _, j := range joined {
		m := j.YtVodMetric
		m.Video = models.YtVodVideo{Title: j.VideoTitle, Tags: j.VideoTags}
		metrics = append(metrics, m)
	}

	type stat struct {
		count      int
		totalViews int64
		totalLikes int64
	}
	kwStats := make(map[string]*stat)
	tagStats := make(map[string]*stat)

	for _, m := range metrics {
		v := m.Video
		likes := int64(0)
		if m.LikeCount != nil {
			likes = *m.LikeCount
		}

		keywords := extractKeywords(v.Title)
		for _, kw := range keywords {
			if kwStats[kw] == nil { kwStats[kw] = &stat{} }
			kwStats[kw].count++
			kwStats[kw].totalViews += m.ViewCount
			kwStats[kw].totalLikes += likes
		}

		// Parse tags from JSON string
		var tags []string
		json.Unmarshal([]byte(v.Tags), &tags)
		
		processedTags := extractTags(v.Title, tags)
		for _, t := range processedTags {
			if tagStats[t] == nil { tagStats[t] = &stat{} }
			tagStats[t].count++
			tagStats[t].totalViews += m.ViewCount
			tagStats[t].totalLikes += likes
		}
	}

	// Save Keyword Stats
	for kw, s := range kwStats {
		if s.count < 1 { continue }
		avgViews := s.totalViews / int64(s.count)
		avgLikes := s.totalLikes / int64(s.count)
		eng := 0.0
		if s.totalViews > 0 { eng = float64(s.totalLikes) / float64(s.totalViews) }

		db.DB.Create(&models.YtVodKeywordStat{
			ID:                uuid.New().String(),
			ScanID:            scanId,
			Keyword:           kw,
			UsageCount:        s.count,
			TotalViews:        s.totalViews,
			AvgViews:          avgViews,
			TotalLikes:        s.totalLikes,
			AvgLikes:          avgLikes,
			AvgEngagementRate: &eng,
		})
	}

	// Save Tag Stats
	for t, s := range tagStats {
		if s.count < 1 { continue }
		avgViews := s.totalViews / int64(s.count)
		eng := 0.0
		if s.totalViews > 0 { eng = float64(s.totalLikes) / float64(s.totalViews) }

		db.DB.Create(&models.YtVodTagStat{
			ID:                uuid.New().String(),
			ScanID:            scanId,
			Tag:               t,
			UsageCount:        s.count,
			TotalViews:        s.totalViews,
			AvgViews:          avgViews,
			TotalLikes:        s.totalLikes,
			AvgEngagementRate: &eng,
		})
	}
}

func processVodChannel(km *ApiKeyManager, ch models.YtChannel, scanId string, limit int, cutoff time.Time) (int, error) {
	upsertVodChannelStatus(scanId, ch.ID, "processing", limit, 0, nil, nil)

	playlistId := ""
	if ch.UploadsPlaylistID != nil && *ch.UploadsPlaylistID != "" {
		playlistId = *ch.UploadsPlaylistID
	} else {
		apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=%s", *ch.YoutubeChannelID)
		resp, err := FetchWithRetry(apiUrl, km, 3)
		if err != nil {
			upsertVodChannelStatus(scanId, ch.ID, "failed", limit, 0, ptrString(err.Error()), nil)
			return 0, err
		}
		var data struct {
			Items []struct {
				ContentDetails struct {
					RelatedPlaylists struct {
						Uploads string `json:"uploads"`
					} `json:"relatedPlaylists"`
				} `json:"contentDetails"`
			} `json:"items"`
		}
		json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if len(data.Items) > 0 {
			playlistId = data.Items[0].ContentDetails.RelatedPlaylists.Uploads
			db.DB.Model(&ch).Update("uploads_playlist_id", playlistId)
		}
	}

	if playlistId == "" {
		upsertVodChannelStatus(scanId, ch.ID, "failed", limit, 0, ptrString("No uploads playlist"), nil)
		return 0, fmt.Errorf("no playlist")
	}

	// Get video IDs
	videoIds := make([]string, 0)
	nextPageToken := ""
	for len(videoIds) < limit {
		apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=%s&maxResults=50", playlistId)
		if nextPageToken != "" {
			apiUrl += "&pageToken=" + nextPageToken
		}
		resp, err := FetchWithRetry(apiUrl, km, 3)
		if err != nil {
			break
		}
		var data struct {
			Items []struct {
				Snippet struct {
					PublishedAt string `json:"publishedAt"`
					ResourceID  struct {
						VideoID string `json:"videoId"`
					} `json:"resourceId"`
				} `json:"snippet"`
			} `json:"items"`
			NextPageToken string `json:"nextPageToken"`
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err := json.Unmarshal(body, &data); err != nil {
			log.Printf("VOD: Failed to decode playlistItems: %v", err)
		}
		
		if len(data.Items) == 0 {
			log.Printf("VOD: No items in playlistItems for %s. Response: %s", playlistId, string(body))
		}

		stoppedEarly := false
		for _, item := range data.Items {
			pubAt, _ := time.Parse(time.RFC3339, item.Snippet.PublishedAt)
			log.Printf("VOD: Found video %s published at %v (cutoff: %v)", item.Snippet.ResourceID.VideoID, pubAt, cutoff)
			if !cutoff.IsZero() && pubAt.Before(cutoff) {
				stoppedEarly = true
				break
			}
			videoIds = append(videoIds, item.Snippet.ResourceID.VideoID)
			if len(videoIds) >= limit {
				break
			}
		}
		nextPageToken = data.NextPageToken
		if nextPageToken == "" || stoppedEarly {
			break
		}
	}

	if len(videoIds) == 0 {
		upsertVodChannelStatus(scanId, ch.ID, "success", limit, 0, nil, nil)
		return 0, nil
	}

	// Fetch video details and persist
	totalPersisted := 0
	for i := 0; i < len(videoIds); i += 50 {
		end := i + 50
		if end > len(videoIds) {
			end = len(videoIds)
		}
		batch := videoIds[i:end]
		
		apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=%s", strings.Join(batch, ","))
		resp, err := FetchWithRetry(apiUrl, km, 3)
		if err == nil {
			var data struct {
				Items []ytVodVideoItem `json:"items"`
			}
			json.NewDecoder(resp.Body).Decode(&data)
			resp.Body.Close()
			
			for _, v := range data.Items {
				pubAt, _ := time.Parse(time.RFC3339, v.Snippet.PublishedAt)
				var video models.YtVodVideo
				err := db.DB.Where("video_id = ?", v.ID).First(&video).Error
				if err != nil {
					durSec := parseDuration(v.ContentDetails.Duration)
					// Pick best thumbnail
					thumbURL := v.Snippet.Thumbnails.Maxres.URL
					if thumbURL == "" { thumbURL = v.Snippet.Thumbnails.High.URL }
					if thumbURL == "" { thumbURL = v.Snippet.Thumbnails.Default.URL }
					var thumbPtr *string
					if thumbURL != "" { thumbPtr = &thumbURL }
					// Serialize tags
					tagsJSON, _ := json.Marshal(v.Snippet.Tags)
					tagsStr := string(tagsJSON)
					if tagsStr == "null" { tagsStr = "[]" }
					video = models.YtVodVideo{
						ID:                uuid.New().String(),
						VideoID:           v.ID,
						ChannelID:         ch.ID,
						Title:             v.Snippet.Title,
						Description:       &v.Snippet.Description,
						Tags:              tagsStr,
						ThumbnailURL:      thumbPtr,
						Duration:          &v.ContentDetails.Duration,
						DurationSeconds:   &durSec,
						PublishedAt:       pubAt,
						FirstSeenScanID:   scanId,
					}
					db.DB.Create(&video)
				}
				
				var views int64
				fmt.Sscanf(v.Statistics.ViewCount, "%d", &views)
				var likes int64
				fmt.Sscanf(v.Statistics.LikeCount, "%d", &likes)
				var comments int64
				fmt.Sscanf(v.Statistics.CommentCount, "%d", &comments)

				db.DB.Create(&models.YtVodMetric{
					ID:           uuid.New().String(),
					VideoID:      video.ID,
					ScanID:       scanId,
					ViewCount:    views,
					LikeCount:    &likes,
					CommentCount: &comments,
				})
				totalPersisted++
			}
		}
	}

	upsertVodChannelStatus(scanId, ch.ID, "success", limit, totalPersisted, nil, nil)
	return totalPersisted, nil
}

type ytVodVideoItem struct {
	ID      string `json:"id"`
	Snippet struct {
		Title       string   `json:"title"`
		Description string   `json:"description"`
		PublishedAt string   `json:"publishedAt"`
		Tags        []string `json:"tags"`
		Thumbnails  struct {
			Default struct { URL string `json:"url"` } `json:"default"`
			High    struct { URL string `json:"url"` } `json:"high"`
			Maxres  struct { URL string `json:"url"` } `json:"maxres"`
		} `json:"thumbnails"`
	} `json:"snippet"`
	ContentDetails struct {
		Duration string `json:"duration"`
	} `json:"contentDetails"`
	Statistics struct {
		ViewCount    string `json:"viewCount"`
		LikeCount    string `json:"likeCount"`
		CommentCount string `json:"commentCount"`
	} `json:"statistics"`
}
