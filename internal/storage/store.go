package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/soulredcat/prediction/internal/market"
)

type Model struct {
	AnchorATH     time.Time `json:"anchor_ath"`
	BearDays      float64   `json:"bear_days"`
	BullDays      float64   `json:"bull_days"`
	UntilYear     int       `json:"until_year"`
	ToleranceDays int       `json:"tolerance_days"`
}

type Store struct {
	pricePath string
	modelPath string
	mu        sync.RWMutex
}

func New(pricePath, modelPath string) *Store {
	return &Store{pricePath: pricePath, modelPath: modelPath}
}

func DefaultModel() Model {
	return Model{
		AnchorATH:     time.Date(2017, time.December, 16, 0, 0, 0, 0, time.UTC),
		BearDays:      370,
		BullDays:      1055.5,
		UntilYear:     2200,
		ToleranceDays: 30,
	}
}

func (s *Store) Ensure() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDir(s.pricePath); err != nil {
		return err
	}
	if err := ensureDir(s.modelPath); err != nil {
		return err
	}
	if _, err := os.Stat(s.pricePath); errors.Is(err, os.ErrNotExist) {
		if err := writeAtomic(s.pricePath, market.Dataset{Version: 1, Asset: "bitcoin", Quote: "usd", Source: "coingecko", Prices: []market.PricePoint{}}); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	if _, err := os.Stat(s.modelPath); errors.Is(err, os.ErrNotExist) {
		if err := writeAtomic(s.modelPath, DefaultModel()); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return nil
}

func (s *Store) LoadPrices() (market.Dataset, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var value market.Dataset
	if err := read(s.pricePath, &value); err != nil {
		return market.Dataset{}, fmt.Errorf("load prices: %w", err)
	}
	if value.Prices == nil {
		value.Prices = []market.PricePoint{}
	}
	return value, nil
}

func (s *Store) SavePrices(value market.Dataset) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeAtomic(s.pricePath, value)
}

func (s *Store) LoadModel() (Model, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var value Model
	if err := read(s.modelPath, &value); err != nil {
		return Model{}, fmt.Errorf("load model: %w", err)
	}
	if err := validateModel(value); err != nil {
		return Model{}, err
	}
	return value, nil
}

func (s *Store) SaveModel(value Model) error {
	if err := validateModel(value); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeAtomic(s.modelPath, value)
}

func validateModel(value Model) error {
	if value.AnchorATH.IsZero() {
		return fmt.Errorf("anchor_ath is required")
	}
	if value.BearDays <= 0 || value.BullDays <= 0 {
		return fmt.Errorf("bear_days and bull_days must be positive")
	}
	if value.UntilYear < value.AnchorATH.Year() || value.UntilYear > 9999 {
		return fmt.Errorf("until_year outside valid range")
	}
	if value.ToleranceDays < 0 || value.ToleranceDays > 365 {
		return fmt.Errorf("tolerance_days must be between 0 and 365")
	}
	return nil
}

func ensureDir(path string) error {
	return os.MkdirAll(filepath.Dir(path), 0o755)
}

func read(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func writeAtomic(path string, value any) error {
	if err := ensureDir(path); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)

	encoder := json.NewEncoder(temp)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempName, 0o644); err != nil {
		return err
	}
	return os.Rename(tempName, path)
}
