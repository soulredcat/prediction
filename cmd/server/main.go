package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/soulredcat/prediction/internal/config"
	"github.com/soulredcat/prediction/internal/cycle"
	"github.com/soulredcat/prediction/internal/httpapi"
	"github.com/soulredcat/prediction/internal/market"
	"github.com/soulredcat/prediction/internal/storage"
	webassets "github.com/soulredcat/prediction/web"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("config", "error", err)
		os.Exit(1)
	}

	store := storage.New(cfg.DataFile, cfg.ModelFile)
	if err := store.Ensure(); err != nil {
		logger.Error("store", "error", err)
		os.Exit(1)
	}

	provider := market.NewCoinGeckoProvider(cfg.CoinGeckoBaseURL, cfg.CoinGeckoAPIKey, cfg.CoinGeckoAPITier)
	marketService := market.NewService(provider, store)
	cycleService := cycle.NewService(store)
	handler := httpapi.New(logger, marketService, cycleService, webassets.Assets)

	if cfg.AutoSync {
		go func() {
			if _, err := marketService.Sync(cfg.SyncFrom, time.Now().UTC().Add(24*time.Hour)); err != nil {
				logger.Error("auto sync", "error", err)
			}
		}()
	}

	server := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		logger.Info("server started", "addr", cfg.APIAddr, "data_file", cfg.DataFile)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server", "error", err)
			os.Exit(1)
		}
	}()
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown", "error", err)
	}
}
