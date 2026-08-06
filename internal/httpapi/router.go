package httpapi

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/soulredcat/prediction/internal/cycle"
	"github.com/soulredcat/prediction/internal/market"
	"github.com/soulredcat/prediction/internal/storage"
)

type Router struct {
	logger *slog.Logger
	market *market.Service
	cycle  *cycle.Service
	assets fs.FS
}

func New(logger *slog.Logger, marketService *market.Service, cycleService *cycle.Service, assets fs.FS) http.Handler {
	router := &Router{logger: logger, market: marketService, cycle: cycleService, assets: assets}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", router.health)
	mux.HandleFunc("GET /api/v1/prices", router.getPrices)
	mux.HandleFunc("POST /api/v1/market/sync", router.syncPrices)
	mux.HandleFunc("GET /api/v1/model", router.getModel)
	mux.HandleFunc("PUT /api/v1/model", router.updateModel)
	mux.HandleFunc("GET /api/v1/cycles", router.getCycles)
	mux.Handle("GET /", http.FileServerFS(assets))
	return router.recover(router.logging(securityHeaders(mux)))
}

func (r *Router) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *Router) getPrices(w http.ResponseWriter, _ *http.Request) {
	value, err := r.market.Get()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (r *Router) syncPrices(w http.ResponseWriter, request *http.Request) {
	from, err := parseDate(request.URL.Query().Get("from"), "2010-07-17")
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	to, err := parseDate(request.URL.Query().Get("to"), time.Now().UTC().Add(24*time.Hour).Format("2006-01-02"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	value, err := r.market.Sync(from, to)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (r *Router) getModel(w http.ResponseWriter, _ *http.Request) {
	value, err := r.cycle.GetModel()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (r *Router) updateModel(w http.ResponseWriter, request *http.Request) {
	defer request.Body.Close()
	decoder := json.NewDecoder(http.MaxBytesReader(w, request.Body, 1<<20))
	decoder.DisallowUnknownFields()
	var value storage.Model
	if err := decoder.Decode(&value); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	updated, err := r.cycle.UpdateModel(value)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (r *Router) getCycles(w http.ResponseWriter, request *http.Request) {
	untilYear := 0
	if raw := strings.TrimSpace(request.URL.Query().Get("until_year")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid until_year"))
			return
		}
		untilYear = parsed
	}
	value, err := r.cycle.Generate(untilYear)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func parseDate(raw, fallback string) (time.Time, error) {
	if strings.TrimSpace(raw) == "" {
		raw = fallback
	}
	value, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("date must use YYYY-MM-DD: %w", err)
	}
	return value.UTC(), nil
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'")
		next.ServeHTTP(w, r)
	})
}

func (r *Router) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, request)
		r.logger.Info("request", "method", request.Method, "path", request.URL.Path, "duration", time.Since(start))
	})
}

func (r *Router) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				r.logger.Error("panic", "value", value)
				writeError(w, http.StatusInternalServerError, fmt.Errorf("internal server error"))
			}
		}()
		next.ServeHTTP(w, request)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
