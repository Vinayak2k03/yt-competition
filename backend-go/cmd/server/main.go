package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/sociowatch/yt-competition-backend/internal/config"
	"github.com/sociowatch/yt-competition-backend/internal/db"
	"github.com/sociowatch/yt-competition-backend/internal/handlers"
)

func main() {

	config.LoadConfig("conf.yaml")

	db.Init(config.AppConfig.Database.URL)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   config.AppConfig.Cors.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Route("/", func(r chi.Router) {
		// API Keys
		r.Get("/yt-api-keys", handlers.GetApiKeys)
		r.Get("/yt-api-keys/count", handlers.GetApiKeysCount)
		r.Post("/yt-api-keys", handlers.CreateApiKey)
		r.Delete("/yt-api-keys/{id}", handlers.DeleteApiKey)
		r.Put("/yt-api-keys/{id}", handlers.UpdateApiKeyQuota)
		r.Post("/yt-api-keys/{id}/reset-error", handlers.ResetApiKeyError)

		// Channels
		r.Get("/yt-channels", handlers.GetChannels)
		r.Get("/yt-channels/active", handlers.GetActiveChannels)
		r.Get("/yt-channels/count", handlers.GetChannelCount)
		r.Post("/yt-channels", handlers.CreateChannel)
		r.Put("/yt-channels/{id}", handlers.UpdateChannel)
		r.Patch("/yt-channels/{id}/toggle", handlers.ToggleChannel)
		r.Delete("/yt-channels/{id}", handlers.DeleteChannel)

		// Live & Scan data endpoints
		r.Get("/latest-scan", handlers.GetLatestScan)
		r.Get("/overview", handlers.GetOverview)
		r.Get("/top-streams", handlers.GetTopStreams)
		r.Get("/title-word-cloud", handlers.GetTitleWordCloud)
		r.Get("/hashtag-ranking", handlers.GetHashtagRanking)
		r.Get("/channels", handlers.GetLiveChannels)
		r.Get("/scans", handlers.GetScans)
		r.Get("/scan-health", handlers.GetScanHealth)
		r.Get("/scan-progress", handlers.GetScanProgress)
		r.Post("/run-scan", handlers.RunScan)
	})

	r.Route("/vod-api", func(r chi.Router) {
		r.Get("/latest-scan", handlers.GetLatestVodScan)
		r.Get("/scans", handlers.GetVodScans)
		r.Get("/overview", handlers.GetVodOverview)
		r.Get("/videos", handlers.GetVodVideos)
		r.Get("/keywords", handlers.GetVodKeywords)
		r.Get("/tags", handlers.GetVodTags)
		r.Get("/scan-health", handlers.GetVodScanHealth)
		r.Get("/publish-timing", handlers.GetPublishTimingData)
		r.Post("/run-vod-scan", handlers.RunVodScan)
	})

	r.Route("/cluster-api", func(r chi.Router) {
		r.Get("/clusters", handlers.GetClusters)
		r.Get("/summaries", handlers.GetClusterSummaries)
		r.Get("/analytics", handlers.GetClusterAnalytics)
		r.Post("/verify-channel", handlers.VerifyChannel)
	})

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Sociowatch Go API is running"))
	})

	port := config.AppConfig.Server.Port
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" {
		port = "3002"
	}

	log.Printf("Starting Go backend on port %s", port)
	http.ListenAndServe(":"+port, r)
}
