package services

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
)

var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "and": true, "or": true, "but": true, "in": true, "on": true, "at": true, "to": true, "for": true, "of": true, "with": true, "by": true,
	"from": true, "up": true, "about": true, "into": true, "through": true, "during": true, "before": true, "after": true, "above": true, "below": true,
	"between": true, "under": true, "again": true, "further": true, "then": true, "once": true, "is": true, "are": true, "was": true, "were": true, "be": true,
	"been": true, "being": true, "have": true, "has": true, "had": true, "do": true, "does": true, "did": true, "will": true, "would": true, "could": true,
	"should": true, "may": true, "might": true, "must": true, "shall": true, "can": true, "need": true, "dare": true, "ought": true, "used": true, "it": true,
	"its": true, "this": true, "that": true, "these": true, "those": true, "i": true, "me": true, "my": true, "myself": true, "we": true, "our": true, "ours": true,
	"ourselves": true, "you": true, "your": true, "yours": true, "yourself": true, "yourselves": true, "he": true, "him": true, "his": true,
	"himself": true, "she": true, "her": true, "hers": true, "herself": true, "they": true, "them": true, "their": true, "theirs": true,
	"themselves": true, "what": true, "which": true, "who": true, "whom": true, "when": true, "where": true, "why": true, "how": true, "all": true,
	"each": true, "few": true, "more": true, "most": true, "other": true, "some": true, "such": true, "no": true, "nor": true, "not": true, "only": true,
	"own": true, "same": true, "so": true, "than": true, "too": true, "very": true, "s": true, "t": true, "just": true, "don": true, "now": true, "live": true,
	"watch": true, "video": true, "news": true, "breaking": true, "latest": true, "update": true, "updates": true, "hindi": true, "english": true,
	"india": true, "indian": true,
}


func upsertScanChannelStatus(scanId, channelId, status string, streamsFound int, errorMessage *string) {
	var existing models.YtScanChannelStatus
	err := db.DB.Where("scan_id = ? AND channel_id = ?", scanId, channelId).First(&existing).Error
	
	if err == nil {
		db.DB.Model(&existing).Updates(map[string]interface{}{
			"status":        status,
			"streams_found": streamsFound,
			"error_message": errorMessage,
		})
	} else {
		db.DB.Create(&models.YtScanChannelStatus{
			ID:           uuid.New().String(),
			ScanID:       scanId,
			ChannelID:    channelId,
			Status:       status,
			StreamsFound: streamsFound,
			ErrorMessage: errorMessage,
		})
	}
}

func RunLiveScan(channelID string) (map[string]any, error) {
	scanStartTime := time.Now()
	isSingle := channelID != ""
	
	km := NewApiKeyManager()
	if err := km.LoadKeys(); err != nil {
		return nil, err
	}

	var scanId string
	if isSingle {
		var latest models.YtScan
		if err := db.DB.Order("created_at desc").First(&latest).Error; err != nil {
			return nil, fmt.Errorf("no existing scan to update")
		}
		scanId = latest.ID
	} else {
		scan := models.YtScan{
			ID:        uuid.New().String(),
			CreatedAt: time.Now(),
			Notes:     ptrString("Automated scan"),
		}
		if err := db.DB.Create(&scan).Error; err != nil {
			return nil, err
		}
		scanId = scan.ID
	}

	var channels []models.YtChannel
	query := db.DB.Where("is_active = ?", true)
	if isSingle {
		query = query.Where("id = ?", channelID)
	}
	query.Find(&channels)

	if !isSingle {
		for _, c := range channels {
			upsertScanChannelStatus(scanId, c.ID, "pending", 0, nil)
		}
	}

	// Resolve missing YouTube Channel IDs
	for i := range channels {
		if channels[i].YoutubeChannelID == nil || *channels[i].YoutubeChannelID == "" {
			log.Printf("LiveScan: Resolving ID for %s (%s)", channels[i].DisplayName, channels[i].YoutubeURL)
			resolved, err := resolveChannelIdFromUrl(km, channels[i].YoutubeURL)
			if err == nil && resolved != "" {
				log.Printf("LiveScan: Resolved %s to %s", channels[i].DisplayName, resolved)
				db.DB.Model(&channels[i]).Update("youtube_channel_id", resolved)
				channels[i].YoutubeChannelID = &resolved
			} else {
				log.Printf("LiveScan: FAILED to resolve ID for %s: %v", channels[i].DisplayName, err)
				upsertScanChannelStatus(scanId, channels[i].ID, "failed", 0, ptrString("Failed to resolve channel ID"))
			}
		}
	}

	// Search each channel for live streams
	type searchResult struct {
		ChannelID string
		Streams   []ytSearchItem
	}
	results := make([]searchResult, 0)

	for _, ch := range channels {
		if ch.YoutubeChannelID == nil || *ch.YoutubeChannelID == "" {
			log.Printf("LiveScan: Skipping %s (no YouTube ID)", ch.DisplayName)
			continue
		}
		
		log.Printf("LiveScan: Searching %s (%s)", ch.DisplayName, *ch.YoutubeChannelID)
		streams, err := searchLiveStreams(km, *ch.YoutubeChannelID, ch.ID, scanId)
		if err == nil {
			log.Printf("LiveScan: Found %d streams for %s", len(streams), ch.DisplayName)
			results = append(results, searchResult{ChannelID: ch.ID, Streams: streams})
		} else {
			log.Printf("LiveScan: ERROR searching %s: %v", ch.DisplayName, err)
		}
	}

	// Collect all video IDs
	videoToChannel := make(map[string]string)
	allVideoIds := make([]string, 0)
	for _, res := range results {
		for _, s := range res.Streams {
			allVideoIds = append(allVideoIds, s.ID.VideoID)
			videoToChannel[s.ID.VideoID] = res.ChannelID
		}
	}

	if len(allVideoIds) == 0 {
		return map[string]any{
			"success":            true,
			"scanId":             scanId,
			"channelsScanned":    len(channels),
			"liveStreamsFound":   0,
			"completionReason":   "complete",
		}, nil
	}

	// Get video details in batches of 50
	videoDetails := make([]ytVideoItem, 0)
	for i := 0; i < len(allVideoIds); i += 50 {
		end := i + 50
		if end > len(allVideoIds) {
			end = len(allVideoIds)
		}
		batch := allVideoIds[i:end]
		
		apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=%s", strings.Join(batch, ","))
		resp, err := FetchWithRetry(apiUrl, km, 3)
		if err == nil {
			var data struct {
				Items []ytVideoItem `json:"items"`
			}
			json.NewDecoder(resp.Body).Decode(&data)
			resp.Body.Close()
			videoDetails = append(videoDetails, data.Items...)
		}
	}

	// Process results and update database
	metricInserts := make([]models.YtStreamScanMetric, 0)
	
	type chanMetric struct {
		totalViews int
		highest    int
		count      int
	}
	channelMetrics := make(map[string]*chanMetric)
	
	type stat struct {
		count        int
		totalViewers int
	}
	keywordStats := make(map[string]*stat)
	tagStats := make(map[string]*stat)

	for _, video := range videoDetails {
		channelDbId := videoToChannel[video.ID]
		if channelDbId == "" {
			continue
		}

		viewers := 0
		fmt.Sscanf(video.LiveStreamingDetails.ConcurrentViewers, "%d", &viewers)
		
		var viewCount int64
		fmt.Sscanf(video.Statistics.ViewCount, "%d", &viewCount)
		var likeCount int64
		fmt.Sscanf(video.Statistics.LikeCount, "%d", &likeCount)

		// Create or update stream
		var stream models.YtStream
		err := db.DB.Where("video_id = ?", video.ID).First(&stream).Error
		if err != nil {
			stream = models.YtStream{
				ID:              uuid.New().String(),
				VideoID:         video.ID,
				ChannelID:       channelDbId,
				Title:           video.Snippet.Title,
				Description:     &video.Snippet.Description,
				FirstSeenScanID: scanId,
				Tags:            "[]",
			}
			db.DB.Create(&stream)
		} else {
			db.DB.Model(&stream).Updates(map[string]interface{}{
				"title":       video.Snippet.Title,
				"description": video.Snippet.Description,
			})
		}

		metricInserts = append(metricInserts, models.YtStreamScanMetric{
			ID:                uuid.New().String(),
			ScanID:            scanId,
			StreamID:          stream.ID,
			ConcurrentViewers: viewers,
			ViewCount:         &viewCount,
			LikeCount:         &likeCount,
			IsLive:            true,
		})

		// Aggregations
		cm := channelMetrics[channelDbId]
		if cm == nil {
			cm = &chanMetric{}
			channelMetrics[channelDbId] = cm
		}
		cm.totalViews += viewers
		if viewers > cm.highest {
			cm.highest = viewers
		}
		cm.count++

		// Keywords & Tags
		keywords := extractKeywords(video.Snippet.Title)
		for _, kw := range keywords {
			s := keywordStats[kw]
			if s == nil {
				s = &stat{}
				keywordStats[kw] = s
			}
			s.count++
			s.totalViewers += viewers
		}

		tags := extractTags(video.Snippet.Title, video.Snippet.Tags)
		for _, t := range tags {
			s := tagStats[t]
			if s == nil {
				s = &stat{}
				tagStats[t] = s
			}
			s.count++
			s.totalViewers += viewers
		}
	}

	// Batch insert metrics
	if len(metricInserts) > 0 {
		db.DB.CreateInBatches(metricInserts, 100)
	}

	// Create Channel Summaries for all channels that were searched
	for _, ch := range channels {
		// Only create summary if the channel was actually searched (had a valid ID)
		if ch.YoutubeChannelID == nil || *ch.YoutubeChannelID == "" {
			continue
		}

		cm := channelMetrics[ch.ID]
		totalViews := 0
		highest := 0
		count := 0
		avgPeak := 0

		if cm != nil {
			totalViews = cm.totalViews
			highest = cm.highest
			count = cm.count
			if count > 0 {
				avgPeak = totalViews / count
			}
		}

		// Delete any existing summary for this scan and channel to prevent duplicates
		db.DB.Where("scan_id = ? AND channel_id = ?", scanId, ch.ID).Delete(&models.YtScanChannelSummary{})

		db.DB.Create(&models.YtScanChannelSummary{
			ID:                   uuid.New().String(),
			ScanID:               scanId,
			ChannelID:            ch.ID,
			TotalConcurrentViews: totalViews,
			HighestConcurrent:    highest,
			NumberOfStreams:      count,
			AveragePeakPerStream: avgPeak,
		})
	}

	// Only update global keyword and tag stats if this is a full scan
	if !isSingle {
		// Create Keyword Stats
		for kw, s := range keywordStats {
			avg := 0
			if s.count > 0 {
				avg = s.totalViewers / s.count
			}
			db.DB.Create(&models.YtScanKeywordStat{
				ID:                   uuid.New().String(),
				ScanID:               scanId,
				Keyword:              kw,
				UsageCount:           s.count,
				TotalConcurrentViews: s.totalViewers,
				AvgConcurrentViews:   avg,
			})
		}

		// Create Tag Stats
		for t, s := range tagStats {
			avg := 0
			if s.count > 0 {
				avg = s.totalViewers / s.count
			}
			db.DB.Create(&models.YtScanTagStat{
				ID:                   uuid.New().String(),
				ScanID:               scanId,
				Tag:                  t,
				UsageCount:           s.count,
				TotalConcurrentViews: s.totalViewers,
				AvgConcurrentViews:   avg,
			})
		}
	}

	log.Printf("Live scan completed in %v", time.Since(scanStartTime))
	return map[string]any{
		"success":            true,
		"scanId":             scanId,
		"channelsScanned":    len(channels),
		"liveStreamsFound":   len(videoDetails),
		"completionReason":   "complete",
	}, nil
}

type ytSearchItem struct {
	ID struct {
		VideoID string `json:"videoId"`
	} `json:"id"`
}

type ytVideoItem struct {
	ID      string `json:"id"`
	Snippet struct {
		Title                string   `json:"title"`
		Description          string   `json:"description"`
		Tags                 []string `json:"tags"`
		DefaultAudioLanguage *string  `json:"defaultAudioLanguage"`
	} `json:"snippet"`
	LiveStreamingDetails struct {
		ConcurrentViewers string `json:"concurrentViewers"`
	} `json:"liveStreamingDetails"`
	Statistics struct {
		ViewCount string `json:"viewCount"`
		LikeCount string `json:"likeCount"`
	} `json:"statistics"`
}

func searchLiveStreams(km *ApiKeyManager, ytChannelId, channelDbId, scanId string) ([]ytSearchItem, error) {
	apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=%s&eventType=live&type=video&maxResults=50", ytChannelId)
	resp, err := FetchWithRetry(apiUrl, km, 3)
	if err != nil {
		upsertScanChannelStatus(scanId, channelDbId, "failed", 0, ptrString(err.Error()))
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Items []ytSearchItem `json:"items"`
	}
	json.NewDecoder(resp.Body).Decode(&data)
	
	upsertScanChannelStatus(scanId, channelDbId, "success", len(data.Items), nil)
	return data.Items, nil
}

func resolveChannelIdFromUrl(km *ApiKeyManager, youtubeUrl string) (string, error) {
	log.Printf("LiveScan: Resolving URL %s", youtubeUrl)
	u, err := url.Parse(youtubeUrl)
	if err != nil {
		log.Printf("LiveScan: URL parse error: %v", err)
		return "", err
	}
	path := u.Path
	log.Printf("LiveScan: Path is %s", path)

	if strings.HasPrefix(path, "/channel/") {
		parts := strings.Split(path, "/")
		if len(parts) >= 3 {
			id := parts[2]
			if strings.HasPrefix(id, "UC") {
				return id, nil
			}
		}
	}

	var identifier string
	var searchType string

	if strings.HasPrefix(path, "/@") {
		identifier = strings.TrimPrefix(strings.Split(path, "/")[1], "@")
		searchType = "forHandle"
	} else if strings.HasPrefix(path, "/c/") {
		parts := strings.Split(path, "/")
		if len(parts) >= 3 {
			identifier = parts[2]
			searchType = "forHandle"
		}
	} else if strings.HasPrefix(path, "/user/") {
		parts := strings.Split(path, "/")
		if len(parts) >= 3 {
			identifier = parts[2]
			searchType = "forUsername"
		}
	}

	if identifier == "" {
		log.Printf("LiveScan: Could not parse identifier from path %s", path)
		return "", fmt.Errorf("could not parse identifier")
	}

	log.Printf("LiveScan: Querying YT API for %s (%s)", identifier, searchType)
	apiUrl := fmt.Sprintf("https://www.googleapis.com/youtube/v3/channels?part=id&%s=%s", searchType, identifier)
	resp, err := FetchWithRetry(apiUrl, km, 3)
	if err != nil {
		log.Printf("LiveScan: YT API error: %v", err)
		return "", err
	}
	defer resp.Body.Close()

	var data struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	json.NewDecoder(resp.Body).Decode(&data)

	if len(data.Items) > 0 {
		log.Printf("LiveScan: YT API found ID: %s", data.Items[0].ID)
		return data.Items[0].ID, nil
	}

	log.Printf("LiveScan: YT API returned 0 items for %s", identifier)
	return "", fmt.Errorf("not found")
}

func ptrString(s string) *string {
	return &s
}
