package httpapi

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/soulredcat/prediction/internal/comparison"
	"github.com/soulredcat/prediction/internal/cycle"
	"github.com/soulredcat/prediction/internal/market"
)

type Router struct {
	logger     *slog.Logger
	market     *market.Service
	comparison *comparison.Service
	cycle      *cycle.Service
	assets     fs.FS
}

func New(logger *slog.Logger, marketService *market.Service, comparisonService *comparison.Service, cycleService *cycle.Service, assets fs.FS) http.Handler {
	router := &Router{logger: logger, market: marketService, comparison: comparisonService, cycle: cycleService, assets: assets}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", router.health)
	mux.HandleFunc("GET /api/v1/prices", router.getPrices)
	mux.HandleFunc("GET /api/v1/comparisons", router.getComparisons)
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

func (r *Router) getComparisons(w http.ResponseWriter, _ *http.Request) {
	value, err := r.comparison.Get()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (r *Router) getCycles(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.cycle.Generate())
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
