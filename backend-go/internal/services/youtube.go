package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
)

type ErrorType string

const (
	ErrorQuota     ErrorType = "quota"
	ErrorInvalid   ErrorType = "invalid"
	ErrorRateLimit ErrorType = "rate_limit"
	ErrorNetwork   ErrorType = "network"
	ErrorForbidden ErrorType = "forbidden"
	ErrorOther     ErrorType = "other"
)

func CategorizeError(status int, body string) ErrorType {
	if status == 403 && strings.Contains(body, "quotaExceeded") {
		return ErrorQuota
	}
	if status == 403 {
		return ErrorForbidden
	}
	if status == 400 || status == 401 {
		return ErrorInvalid
	}
	if status == 429 {
		return ErrorRateLimit
	}
	return ErrorOther
}

type ApiKeyManager struct {
	keys           []models.YtApiKey
	requestCounter int
	exhaustedKeys  map[string]bool
}

func NewApiKeyManager() *ApiKeyManager {
	return &ApiKeyManager{
		exhaustedKeys: make(map[string]bool),
	}
}

func (m *ApiKeyManager) LoadKeys() error {
	twentyFourHoursAgo := time.Now().Add(-24 * time.Hour)

	// Reset expired quotas
	db.DB.Model(&models.YtApiKey{}).
		Where("is_active = ? AND quota_exceeded_at < ?", true, twentyFourHoursAgo).
		Updates(map[string]interface{}{
			"quota_exceeded_at":  nil,
			"error_type":         nil,
			"consecutive_errors": 0,
		})

	var dbKeys []models.YtApiKey
	err := db.DB.Where("is_active = ? AND quota_exceeded_at IS NULL", true).
		Order("created_at asc").
		Find(&dbKeys).Error

	if err != nil {
		return err
	}

	if len(dbKeys) == 0 {
		return errors.New("no YouTube API keys available")
	}

	m.keys = dbKeys
	log.Printf("Loaded %d API key(s)", len(m.keys))
	return nil
}

func (m *ApiKeyManager) GetCurrentKey() *models.YtApiKey {
	var available []models.YtApiKey
	for _, k := range m.keys {
		if !m.exhaustedKeys[k.ID] {
			available = append(available, k)
		}
	}

	if len(available) == 0 {
		return nil
	}

	key := &available[m.requestCounter%len(available)]
	m.requestCounter++
	return key
}

func (m *ApiKeyManager) MarkExhausted(id string, errType ErrorType, message string) {
	m.exhaustedKeys[id] = true
	now := time.Now()
	
	updates := map[string]interface{}{
		"last_error":         message,
		"last_error_at":      &now,
		"error_type":         string(errType),
		"consecutive_errors": db.DB.Raw("consecutive_errors + 1"),
	}

	if errType == ErrorQuota {
		updates["quota_exceeded_at"] = &now
	}

	db.DB.Model(&models.YtApiKey{}).Where("id = ?", id).Updates(updates)
}

func (m *ApiKeyManager) UpdateLastUsed(id string) {
	now := time.Now()
	db.DB.Model(&models.YtApiKey{}).Where("id = ?", id).Update("last_used_at", &now)
}

func (m *ApiKeyManager) ClearError(id string) {
	db.DB.Model(&models.YtApiKey{}).Where("id = ?", id).Updates(map[string]interface{}{
		"last_error":         nil,
		"last_error_at":      nil,
		"error_type":         nil,
		"consecutive_errors": 0,
	})
}

func (m *ApiKeyManager) HasAvailable() bool {
	for _, k := range m.keys {
		if !m.exhaustedKeys[k.ID] {
			return true
		}
	}
	return false
}

type YoutubeChannelData struct {
	ChannelID   string `json:"channelId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Thumbnail   string `json:"thumbnail"`
}

func FetchChannelFromYoutube(ytUrl string) (*YoutubeChannelData, error) {
	km := NewApiKeyManager()
	if err := km.LoadKeys(); err != nil {
		return nil, err
	}

	keyRecord := km.GetCurrentKey()
	if keyRecord == nil {
		return nil, errors.New("all API keys exhausted")
	}

	apiKey := keyRecord.ApiKey

	// Extract handle or channel ID
	handleRegex := regexp.MustCompile(`@([a-zA-Z0-9_-]+)`)
	channelIdRegex := regexp.MustCompile(`channel/([a-zA-Z0-9_-]+)`)

	handleMatch := handleRegex.FindStringSubmatch(ytUrl)
	channelIdMatch := channelIdRegex.FindStringSubmatch(ytUrl)

	var searchUrl string
	if len(handleMatch) > 1 {
		searchUrl = fmt.Sprintf("https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=%s&key=%s", url.QueryEscape(handleMatch[1]), apiKey)
	} else if len(channelIdMatch) > 1 {
		searchUrl = fmt.Sprintf("https://www.googleapis.com/youtube/v3/channels?part=snippet&id=%s&key=%s", channelIdMatch[1], apiKey)
	} else {
		return nil, errors.New("invalid YouTube URL format. Must contain @handle or /channel/ID")
	}

	resp, err := http.Get(searchUrl)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Items []struct {
			ID      interface{} `json:"id"`
			Snippet struct {
				ChannelID   string `json:"channelId"`
				Title       string `json:"title"`
				Description string `json:"description"`
				Thumbnails  struct {
					Default struct {
						URL string `json:"url"`
					} `json:"default"`
				} `json:"thumbnails"`
			} `json:"snippet"`
		} `json:"items"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		if data.Error.Message != "" {
			return nil, errors.New(data.Error.Message)
		}
		return nil, fmt.Errorf("YouTube API error: %d", resp.StatusCode)
	}

	if len(data.Items) == 0 {
		return nil, errors.New("channel not found")
	}

	item := data.Items[0]
	res := &YoutubeChannelData{
		Title:       item.Snippet.Title,
		Description: item.Snippet.Description,
		Thumbnail:   item.Snippet.Thumbnails.Default.URL,
	}

	if len(handleMatch) > 1 {
		res.ChannelID = item.Snippet.ChannelID
	} else {
		if id, ok := item.ID.(string); ok {
			res.ChannelID = id
		} else {
			res.ChannelID = item.Snippet.ChannelID
		}
	}
	km.UpdateLastUsed(keyRecord.ID)
	return res, nil
}

func FetchWithRetry(apiUrl string, km *ApiKeyManager, maxRetries int) (*http.Response, error) {
	var lastErr error
	networkRetries := 0

	for attempt := 0; attempt < maxRetries; attempt++ {
		key := km.GetCurrentKey()
		if key == nil {
			return nil, errors.New("all API keys exhausted")
		}

		u, err := url.Parse(apiUrl)
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("key", key.ApiKey)
		u.RawQuery = q.Encode()

		resp, err := http.Get(u.String())
		if err != nil {
			networkRetries++
			if networkRetries < 3 {
				time.Sleep(time.Duration(1<<networkRetries) * time.Second)
				attempt--
				continue
			}
			km.MarkExhausted(key.ID, ErrorNetwork, err.Error())
			lastErr = err
			if km.HasAvailable() {
				continue
			}
			return nil, lastErr
		}

		if resp.StatusCode == http.StatusOK {
			km.UpdateLastUsed(key.ID)
			km.ClearError(key.ID)
			return resp, nil
		}

		// Handle errors
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		log.Printf("VOD: YouTube API Error %d: %s", resp.StatusCode, string(body))
		
		var errData struct {
			Error struct {
				Message string `json:"message"`
				Errors  []struct {
					Reason string `json:"reason"`
				} `json:"errors"`
			} `json:"error"`
		}
		json.Unmarshal(body, &errData)

		errType := CategorizeError(resp.StatusCode, errData.Error.Message)
		for _, e := range errData.Error.Errors {
			if e.Reason == "quotaExceeded" {
				errType = ErrorQuota
			}
		}

		if errType == ErrorQuota || errType == ErrorInvalid || errType == ErrorForbidden {
			km.MarkExhausted(key.ID, errType, errData.Error.Message)
			if km.HasAvailable() {
				continue
			}
			return nil, fmt.Errorf("all keys exhausted: %s", errType)
		}

		if errType == ErrorRateLimit {
			time.Sleep(time.Duration(1<<attempt) * time.Second)
			continue
		}

		lastErr = fmt.Errorf("YouTube API error %d: %s", resp.StatusCode, errData.Error.Message)
	}

	return nil, lastErr
}
func extractKeywords(title string) []string {
	if title == "" { return []string{} }
	reg := regexp.MustCompile(`[^a-zA-Z0-9\s]`)
	cleanTitle := reg.ReplaceAllString(strings.ToLower(title), " ")
	words := strings.Fields(cleanTitle)
	
	stopwords := map[string]bool{
		"the":true, "and":true, "for":true, "with":true, "live":true, "now":true, "new":true,
		"hindi":true, "news":true, "india":true, "latest":true, "today":true, "update":true,
		"breaking":true, "top":true, "this":true, "that":true, "from":true, "your":true,
	}
	
	seen := make(map[string]bool)
	var keywords []string
	for _, w := range words {
		if len(w) > 3 && !stopwords[w] && !seen[w] {
			keywords = append(keywords, w)
			seen[w] = true
		}
	}
	return keywords
}

func extractTags(title string, youtubeTags []string) []string {
	seen := make(map[string]bool)
	var result []string
	
	// Add YouTube tags first
	for _, t := range youtubeTags {
		clean := strings.ToLower(strings.TrimSpace(t))
		if clean != "" && !seen[clean] {
			result = append(result, clean)
			seen[clean] = true
		}
	}
	
	// Extract hashtags from title
	hashtagReg := regexp.MustCompile(`#([a-zA-Z0-9_]+)`)
	matches := hashtagReg.FindAllStringSubmatch(title, -1)
	for _, m := range matches {
		if len(m) > 1 {
			tag := strings.ToLower(m[1])
			if !seen[tag] {
				result = append(result, tag)
				seen[tag] = true
			}
		}
	}
	
	return result
}
