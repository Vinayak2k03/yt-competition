package handlers

import (
	"math"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/models"
)

func maskApiKey(key string) string {
	if len(key) <= 8 {
		return strings.Repeat("•", 8)
	}
	masked := key[:4] + strings.Repeat("•", int(math.Max(20, float64(len(key)-8)))) + key[len(key)-4:]
	return masked
}

func apiKeyToResponse(k models.YtApiKey) map[string]interface{} {
	return map[string]interface{}{
		"id":                 k.ID,
		"name":               k.Name,
		"api_key":            maskApiKey(k.ApiKey),
		"is_active":          k.IsActive,
		"daily_quota":        k.DailyQuota,
		"quota_exceeded_at":  k.QuotaExceededAt,
		"last_used_at":       k.LastUsedAt,
		"last_error":         k.LastError,
		"last_error_at":      k.LastErrorAt,
		"error_type":         k.ErrorType,
		"consecutive_errors": k.ConsecutiveErrors,
		"created_at":         k.CreatedAt,
	}
}

func GetApiKeys(w http.ResponseWriter, r *http.Request) {
	var keys []models.YtApiKey
	if err := db.DB.Order("created_at desc").Find(&keys).Error; err != nil {
		jsonError(w, "Failed to query api keys", 500)
		return
	}

	resp := make([]map[string]interface{}, len(keys))
	for i, k := range keys {
		resp[i] = apiKeyToResponse(k)
	}

	jsonOK(w, resp)
}

type CreateApiKeyRequest struct {
	ApiKey string `json:"api_key"`
	Name   string `json:"name"`
}

func CreateApiKey(w http.ResponseWriter, r *http.Request) {
	var req CreateApiKeyRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}

	if req.ApiKey == "" || req.Name == "" {
		jsonError(w, "api_key and name are required", 400)
		return
	}

	key := models.YtApiKey{
		ID:       uuid.New().String(),
		ApiKey:   req.ApiKey,
		Name:     req.Name,
		IsActive: true,
	}

	if err := db.DB.Create(&key).Error; err != nil {
		jsonError(w, "Failed to create api key", 500)
		return
	}

	w.WriteHeader(201)
	jsonOK(w, apiKeyToResponse(key))
}

func DeleteApiKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := db.DB.Where("id = ?", id).Delete(&models.YtApiKey{}).Error; err != nil {
		jsonError(w, "Failed to delete api key", 500)
		return
	}
	jsonOK(w, map[string]string{"message": "API key deleted successfully"})
}

type UpdateQuotaRequest struct {
	DailyQuota int `json:"daily_quota"`
}

func UpdateApiKeyQuota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateQuotaRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonError(w, "Invalid JSON", 400)
		return
	}

	if err := db.DB.Model(&models.YtApiKey{}).Where("id = ?", id).Update("daily_quota", req.DailyQuota).Error; err != nil {
		jsonError(w, "Failed to update quota", 500)
		return
	}

	var key models.YtApiKey
	db.DB.First(&key, "id = ?", id)
	jsonOK(w, apiKeyToResponse(key))
}

func ResetApiKeyError(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := db.DB.Model(&models.YtApiKey{}).Where("id = ?", id).Updates(map[string]interface{}{
		"error_type":         nil,
		"last_error":         nil,
		"last_error_at":      nil,
		"quota_exceeded_at":  nil,
		"consecutive_errors": 0,
	}).Error; err != nil {
		jsonError(w, "Failed to reset error", 500)
		return
	}

	var key models.YtApiKey
	db.DB.First(&key, "id = ?", id)
	jsonOK(w, apiKeyToResponse(key))
}

func GetApiKeysCount(w http.ResponseWriter, r *http.Request) {
	var count int64
	if err := db.DB.Model(&models.YtApiKey{}).Count(&count).Error; err != nil {
		jsonError(w, "Failed to count api keys", 500)
		return
	}
	jsonOK(w, map[string]interface{}{"count": count})
}
