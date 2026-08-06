package config

import (
	"os"
	"strings"
)

type Config struct {
	APIAddr       string
	DataFile      string
	ComparisonDir string
}

func Load() (Config, error) {
	return Config{
		APIAddr:       env("API_ADDR", ":8080"),
		DataFile:      env("DATA_FILE", "./data/btc_prices.json"),
		ComparisonDir: env("COMPARISON_DIR", "./data/comparisons"),
	}, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
