package market

import (
	"fmt"
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
	Interval  string       `json:"interval"`
	Source    string       `json:"source"`
	SourceURL string       `json:"source_url,omitempty"`
	UpdatedAt *time.Time   `json:"updated_at"`
	Prices    []PricePoint `json:"prices"`
}

type Repository interface {
	LoadPrices() (Dataset, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Get() (Dataset, error) {
	value, err := s.repo.LoadPrices()
	if err != nil {
		return Dataset{}, err
	}
	if value.Version != 1 {
		return Dataset{}, fmt.Errorf("unsupported price dataset version: %d", value.Version)
	}
	if value.Asset != "bitcoin" || value.Quote != "usd" {
		return Dataset{}, fmt.Errorf("unexpected price market: %s/%s", value.Asset, value.Quote)
	}
	if value.Prices == nil {
		value.Prices = []PricePoint{}
	}
	return value, nil
}
