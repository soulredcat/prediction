package market

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type PricePoint struct {
	Timestamp time.Time `json:"timestamp"`
	Date      string    `json:"date"`
	PriceUSD  float64   `json:"price_usd"`
}

type Dataset struct {
	Version   int          `json:"version"`
	Asset     string       `json:"asset"`
	Quote     string       `json:"quote"`
	Source    string       `json:"source"`
	UpdatedAt *time.Time   `json:"updated_at"`
	Prices    []PricePoint `json:"prices"`
}

type Repository interface {
	LoadPrices() (Dataset, error)
	SavePrices(Dataset) error
}

type Provider interface {
	Name() string
	FetchPrices(from, to time.Time) ([]PricePoint, error)
}

type Service struct {
	provider Provider
	repo     Repository
}

func NewService(provider Provider, repo Repository) *Service {
	return &Service{provider: provider, repo: repo}
}

func (s *Service) Get() (Dataset, error) { return s.repo.LoadPrices() }

func (s *Service) Sync(from, to time.Time) (Dataset, error) {
	points, err := s.provider.FetchPrices(from.UTC(), to.UTC())
	if err != nil {
		return Dataset{}, err
	}
	if len(points) == 0 {
		return Dataset{}, fmt.Errorf("provider returned zero price points")
	}

	current, err := s.repo.LoadPrices()
	if err != nil {
		return Dataset{}, err
	}

	byDate := make(map[string]PricePoint, len(current.Prices)+len(points))
	for _, point := range current.Prices {
		byDate[point.Date] = point
	}
	for _, point := range points {
		byDate[point.Date] = point
	}

	merged := make([]PricePoint, 0, len(byDate))
	for _, point := range byDate {
		merged = append(merged, point)
	}
	sort.Slice(merged, func(i, j int) bool { return merged[i].Timestamp.Before(merged[j].Timestamp) })

	now := time.Now().UTC()
	dataset := Dataset{
		Version:   1,
		Asset:     "bitcoin",
		Quote:     "usd",
		Source:    s.provider.Name(),
		UpdatedAt: &now,
		Prices:    merged,
	}
	if err := s.repo.SavePrices(dataset); err != nil {
		return Dataset{}, err
	}
	return dataset, nil
}

type CoinGeckoProvider struct {
	client  *http.Client
	baseURL string
	apiKey  string
	tier    string
}

func NewCoinGeckoProvider(baseURL, apiKey, tier string) *CoinGeckoProvider {
	tier = strings.ToLower(strings.TrimSpace(tier))
	if baseURL == "" {
		if tier == "pro" {
			baseURL = "https://pro-api.coingecko.com/api/v3"
		} else {
			baseURL = "https://api.coingecko.com/api/v3"
		}
	}
	return &CoinGeckoProvider{
		client:  &http.Client{Timeout: 60 * time.Second},
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  strings.TrimSpace(apiKey),
		tier:    tier,
	}
}

func (p *CoinGeckoProvider) Name() string { return "coingecko" }

func (p *CoinGeckoProvider) FetchPrices(from, to time.Time) ([]PricePoint, error) {
	if !to.After(from) {
		return nil, fmt.Errorf("to must be after from")
	}

	endpoint, err := url.Parse(p.baseURL + "/coins/bitcoin/market_chart/range")
	if err != nil {
		return nil, fmt.Errorf("build CoinGecko URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("vs_currency", "usd")
	query.Set("from", strconv.FormatInt(from.Unix(), 10))
	query.Set("to", strconv.FormatInt(to.Unix(), 10))
	query.Set("interval", "daily")
	query.Set("precision", "full")
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create CoinGecko request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "soulredcat-prediction/1.0")
	if p.apiKey != "" {
		if p.tier == "pro" {
			req.Header.Set("x-cg-pro-api-key", p.apiKey)
		} else {
			req.Header.Set("x-cg-demo-api-key", p.apiKey)
		}
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request CoinGecko: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var body any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		return nil, fmt.Errorf("CoinGecko HTTP %d: %v", resp.StatusCode, body)
	}

	var payload struct {
		Prices [][]float64 `json:"prices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode CoinGecko response: %w", err)
	}

	byDate := make(map[string]PricePoint, len(payload.Prices))
	for _, row := range payload.Prices {
		if len(row) < 2 || row[1] <= 0 {
			continue
		}
		timestamp := time.UnixMilli(int64(row[0])).UTC()
		date := timestamp.Format("2006-01-02")
		byDate[date] = PricePoint{Timestamp: timestamp, Date: date, PriceUSD: row[1]}
	}

	points := make([]PricePoint, 0, len(byDate))
	for _, point := range byDate {
		points = append(points, point)
	}
	sort.Slice(points, func(i, j int) bool { return points[i].Timestamp.Before(points[j].Timestamp) })
	return points, nil
}
