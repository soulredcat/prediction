package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/soulredcat/prediction/internal/market"
)

type Store struct {
	pricePath string
	mu        sync.RWMutex
}

func New(pricePath string) *Store {
	return &Store{pricePath: pricePath}
}

func (s *Store) Ensure() error {
	info, err := os.Stat(s.pricePath)
	if err != nil {
		return fmt.Errorf("price dataset unavailable: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("price dataset path is a directory: %s", s.pricePath)
	}
	return nil
}

func (s *Store) LoadPrices() (market.Dataset, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	file, err := os.Open(s.pricePath)
	if err != nil {
		return market.Dataset{}, fmt.Errorf("open prices: %w", err)
	}
	defer file.Close()

	var value market.Dataset
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return market.Dataset{}, fmt.Errorf("decode prices: %w", err)
	}
	if value.Prices == nil {
		value.Prices = []market.PricePoint{}
	}
	return value, nil
}
