package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
)

type channelBody struct {
	DisplayName      string  `json:"display_name"`
	YoutubeURL       string  `json:"youtube_url"`
	YoutubeChannelID *string `json:"youtube_channel_id"`
	NetworkGroup     *string `json:"network_group"`
	BrandCluster     *string `json:"brand_cluster"`
	IsActive         *bool   `json:"is_active"`
}

func channelToResponse(c models.YtChannel) map[string]any {
	return map[string]any{
		"id":                 c.ID,
		"display_name":       c.DisplayName,
		"youtube_url":        c.YoutubeURL,
		"youtube_channel_id": c.YoutubeChannelID,
		"network_group":      c.NetworkGroup,
		"brand_cluster":      c.BrandCluster,
		"is_active":          c.IsActive,
		"created_at":         c.CreatedAt,
	}
}

// GET /api/yt-channels
func GetChannels(w http.ResponseWriter, r *http.Request) {
	var channels []models.YtChannel
	if err := db.DB.Order("display_name asc").Find(&channels).Error; err != nil {
		jsonError(w, "Failed to fetch channels", 500)
		return
	}
	result := make([]map[string]any, len(channels))
	for i, c := range channels {
		result[i] = channelToResponse(c)
	}
	jsonOK(w, result)
}

// GET /api/yt-channels/active
func GetActiveChannels(w http.ResponseWriter, r *http.Request) {
	var channels []models.YtChannel
	if err := db.DB.Where("is_active = ?", true).Order("display_name asc").Find(&channels).Error; err != nil {
		jsonError(w, "Failed to fetch channels", 500)
		return
	}
	result := make([]map[string]any, len(channels))
	for i, c := range channels {
		result[i] = channelToResponse(c)
	}
	jsonOK(w, result)
}

// GET /api/yt-channels/count
func GetChannelCount(w http.ResponseWriter, r *http.Request) {
	var count int64
	db.DB.Model(&models.YtChannel{}).Where("is_active = ?", true).Count(&count)
	jsonOK(w, map[string]any{"count": count})
}

// POST /api/yt-channels
func CreateChannel(w http.ResponseWriter, r *http.Request) {
	var body channelBody
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}
	if body.DisplayName == "" || body.YoutubeURL == "" {
		jsonError(w, "display_name and youtube_url are required", 400)
		return
	}

	channel := models.YtChannel{
		ID:               uuid.New().String(),
		DisplayName:      body.DisplayName,
		YoutubeURL:       body.YoutubeURL,
		YoutubeChannelID: body.YoutubeChannelID,
		NetworkGroup:     body.NetworkGroup,
		BrandCluster:     body.BrandCluster,
		IsActive:         true,
	}

	if err := db.DB.Create(&channel).Error; err != nil {
		jsonError(w, "Failed to create channel", 500)
		return
	}
	w.WriteHeader(201)
	jsonOK(w, channelToResponse(channel))
}

// PUT /api/yt-channels/:id
func UpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body channelBody
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}

	updates := map[string]any{}
	if body.DisplayName != "" {
		updates["display_name"] = body.DisplayName
	}
	if body.YoutubeURL != "" {
		updates["youtube_url"] = body.YoutubeURL
	}
	if body.YoutubeChannelID != nil {
		updates["youtube_channel_id"] = body.YoutubeChannelID
	}
	if body.NetworkGroup != nil {
		updates["network_group"] = body.NetworkGroup
	}
	if body.BrandCluster != nil {
		updates["brand_cluster"] = body.BrandCluster
	}
	if body.IsActive != nil {
		updates["is_active"] = *body.IsActive
	}

	if err := db.DB.Model(&models.YtChannel{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		jsonError(w, "Failed to update channel", 500)
		return
	}

	var channel models.YtChannel
	db.DB.First(&channel, "id = ?", id)
	jsonOK(w, channelToResponse(channel))
}

// PATCH /api/yt-channels/:id/toggle
func ToggleChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		IsActive bool `json:"is_active"`
	}
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}
	if err := db.DB.Model(&models.YtChannel{}).Where("id = ?", id).Update("is_active", body.IsActive).Error; err != nil {
		jsonError(w, "Failed to toggle channel", 500)
		return
	}
	var channel models.YtChannel
	db.DB.First(&channel, "id = ?", id)
	jsonOK(w, channelToResponse(channel))
}

// DELETE /api/yt-channels/:id
func DeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := db.DB.Delete(&models.YtChannel{}, "id = ?", id).Error; err != nil {
		jsonError(w, "Failed to delete channel", 500)
		return
	}
	jsonOK(w, map[string]any{"success": true})
}
