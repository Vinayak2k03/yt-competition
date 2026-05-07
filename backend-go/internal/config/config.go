package config

import (
	"log"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		Port string `yaml:"port"`
	} `yaml:"server"`
	Database struct {
		URL string `yaml:"url"`
	} `yaml:"database"`
	Cors struct {
		AllowedOrigins []string `yaml:"allowed_origins"`
	} `yaml:"cors"`
	Auth struct {
		JWTSecret string `yaml:"jwt_secret"`
	} `yaml:"auth"`
}

var AppConfig *Config

func LoadConfig(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Failed to read conf.yaml: %v", err)
	}

	AppConfig = &Config{}
	err = yaml.Unmarshal(data, AppConfig)
	if err != nil {
		log.Fatalf("Failed to parse conf.yaml: %v", err)
	}

	// Fallbacks
	if AppConfig.Server.Port == "" {
		AppConfig.Server.Port = "3002"
	}
	if AppConfig.Database.URL == "" {
		AppConfig.Database.URL = "file:../backend/prisma/dev.db"
	}
	if len(AppConfig.Cors.AllowedOrigins) == 0 {
		AppConfig.Cors.AllowedOrigins = []string{"*"}
	}
}