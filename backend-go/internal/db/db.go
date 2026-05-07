package db

import (
	"fmt"
	"log"
        "path/filepath"
        "strings"

	"github.com/glebarez/sqlite"
	"github.com/sociowatch/yt-competition-backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(dbURL string) {
	if dbURL == "" {
		dbURL = "dev.db"
	}
        if strings.HasPrefix(dbURL, "file:") {
                dbURL = strings.TrimPrefix(dbURL, "file:")
        }

        absPath, _ := filepath.Abs(dbURL)

        // Add WAL mode for better concurrent access
        dsn := fmt.Sprintf("%s?_journal_mode=WAL&_foreign_keys=on", absPath)

        var err error
        DB, err = gorm.Open(sqlite.Open(dsn), &gorm.Config{
                Logger: logger.Default.LogMode(logger.Warn),
                DisableForeignKeyConstraintWhenMigrating: true,
        })
        if err != nil {
                log.Fatalf("Failed to connect to database: %v", err)
        }

        // Run migrations to create/update tables
        err = DB.AutoMigrate(
                &models.YtChannel{},
                &models.YtApiKey{},
                &models.YtScan{},
                &models.YtStream{},
                &models.YtStreamScanMetric{},
                &models.YtScanChannelSummary{},
                &models.YtScanKeywordStat{},
                &models.YtScanTagStat{},
                &models.YtScanChannelStatus{},
                &models.YtVodScan{},
                &models.YtVodVideo{},
                &models.YtVodMetric{},
                &models.YtVodScanChannelStatus{},
                &models.YtVodScanVideoStatus{},
                &models.YtVodKeywordStat{},
                &models.YtVodTagStat{},
        )
        if err != nil {
                log.Fatalf("Failed to migrate database: %v", err)
        }

        log.Printf("✅ Database connected: %s", absPath)
}
