package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	APIAddr          string
	DataFile         string
	ModelFile        string
	AutoSync         bool
	SyncFrom         time.Time
	CoinGeckoAPIKey  string
	CoinGeckoAPITier string
	CoinGeckoBaseURL string
}

func Load() (Config, error) {
	autoSync, err := strconv.ParseBool(env("AUTO_SYNC", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("parse AUTO_SYNC: %w", err)
	}

	syncFrom, err := time.Parse("2006-01-02", env("SYNC_FROM", "2010-07-17"))
	if err != nil {
		return Config{}, fmt.Errorf("parse SYNC_FROM: %w", err)
	}

	return Config{
		APIAddr:          env("API_ADDR", ":8080"),
		DataFile:         env("DATA_FILE", "./data/btc_prices.json"),
		ModelFile:        env("MODEL_FILE", "./data/model_config.json"),
		AutoSync:         autoSync,
		SyncFrom:         syncFrom.UTC(),
		CoinGeckoAPIKey:  strings.TrimSpace(os.Getenv("COINGECKO_API_KEY")),
		CoinGeckoAPITier: strings.ToLower(env("COINGECKO_API_TIER", "demo")),
		CoinGeckoBaseURL: strings.TrimSpace(os.Getenv("COINGECKO_BASE_URL")),
	}, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
