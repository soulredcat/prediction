package comparison

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Point struct {
	Timestamp time.Time `json:"timestamp"`
	Date      string    `json:"date"`
	Value     float64   `json:"value"`
}

type Series struct {
	Version   int       `json:"version"`
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	Interval  string    `json:"interval"`
	Source    string    `json:"source"`
	SourceURL string    `json:"source_url,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
	Points    []Point   `json:"points"`
}

type Response struct {
	Series []Series `json:"series"`
}

type Service struct{ directory string }

func NewService(directory string) *Service { return &Service{directory: directory} }

func (s *Service) Get() (Response, error) {
	entries, err := os.ReadDir(s.directory)
	if errors.Is(err, os.ErrNotExist) {
		return Response{Series: []Series{}}, nil
	}
	if err != nil {
		return Response{}, fmt.Errorf("read comparison directory: %w", err)
	}

	series := make([]Series, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		value, err := load(filepath.Join(s.directory, entry.Name()))
		if err != nil {
			return Response{}, err
		}
		series = append(series, value)
	}
	sort.Slice(series, func(i, j int) bool { return series[i].ID < series[j].ID })
	return Response{Series: series}, nil
}

func load(path string) (Series, error) {
	file, err := os.Open(path)
	if err != nil {
		return Series{}, fmt.Errorf("open comparison %s: %w", path, err)
	}
	defer file.Close()

	var value Series
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return Series{}, fmt.Errorf("decode comparison %s: %w", path, err)
	}
	if err := Validate(value); err != nil {
		return Series{}, fmt.Errorf("validate comparison %s: %w", path, err)
	}
	return value, nil
}

func Validate(value Series) error {
	if value.Version != 1 {
		return fmt.Errorf("unsupported version %d", value.Version)
	}
	if strings.TrimSpace(value.ID) == "" || strings.TrimSpace(value.Label) == "" {
		return fmt.Errorf("id and label are required")
	}
	if value.Interval != "1d" {
		return fmt.Errorf("interval must be 1d")
	}
	if value.Points == nil {
		return fmt.Errorf("points are required")
	}
	var previous time.Time
	for index, point := range value.Points {
		if point.Timestamp.IsZero() || point.Date == "" || math.IsNaN(point.Value) || math.IsInf(point.Value, 0) {
			return fmt.Errorf("invalid point %d", index)
		}
		if point.Date != point.Timestamp.UTC().Format("2006-01-02") {
			return fmt.Errorf("point %d date does not match timestamp", index)
		}
		if !previous.IsZero() && !point.Timestamp.After(previous) {
			return fmt.Errorf("points must be strictly ascending")
		}
		previous = point.Timestamp
	}
	return nil
}
