package main

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/soulredcat/prediction/internal/market"
)

const defaultSourceURL = "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv"

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "import prices:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	flags := flag.NewFlagSet("import-prices", flag.ContinueOnError)
	inputPath := flags.String("input", "", "Coin Metrics BTC CSV input path")
	outputPath := flags.String("output", "./data/btc_prices.json", "output JSON path")
	sourceURL := flags.String("source-url", defaultSourceURL, "dataset source URL recorded in metadata")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*inputPath) == "" {
		return errors.New("-input is required")
	}

	input, err := os.Open(*inputPath)
	if err != nil {
		return fmt.Errorf("open input: %w", err)
	}
	defer input.Close()

	dataset, err := importCSV(input, strings.TrimSpace(*sourceURL), time.Now().UTC())
	if err != nil {
		return err
	}
	if err := writeAtomic(*outputPath, dataset); err != nil {
		return fmt.Errorf("write output: %w", err)
	}
	fmt.Printf("wrote %d daily BTC/USD prices to %s\n", len(dataset.Prices), *outputPath)
	return nil
}

func importCSV(input io.Reader, sourceURL string, generatedAt time.Time) (market.Dataset, error) {
	reader := csv.NewReader(input)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return market.Dataset{}, fmt.Errorf("read CSV header: %w", err)
	}
	dateIndex := columnIndex(header, "time")
	priceIndex := columnIndex(header, "PriceUSD")
	if dateIndex < 0 || priceIndex < 0 {
		return market.Dataset{}, errors.New("CSV must contain time and PriceUSD columns")
	}

	byDate := make(map[string]market.PricePoint, 7000)
	for rowNumber := 2; ; rowNumber++ {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return market.Dataset{}, fmt.Errorf("read CSV row %d: %w", rowNumber, err)
		}
		if dateIndex >= len(record) || priceIndex >= len(record) {
			continue
		}

		rawDate := strings.TrimSpace(record[dateIndex])
		rawPrice := strings.TrimSpace(record[priceIndex])
		if rawDate == "" || rawPrice == "" {
			continue
		}
		date, err := time.Parse("2006-01-02", rawDate)
		if err != nil {
			return market.Dataset{}, fmt.Errorf("parse date at row %d: %w", rowNumber, err)
		}
		price, err := strconv.ParseFloat(rawPrice, 64)
		if err != nil {
			return market.Dataset{}, fmt.Errorf("parse PriceUSD at row %d: %w", rowNumber, err)
		}
		if price <= 0 {
			continue
		}

		date = date.UTC()
		key := date.Format("2006-01-02")
		byDate[key] = market.PricePoint{
			Timestamp: date,
			Date:      key,
			PriceUSD:  price,
		}
	}
	if len(byDate) == 0 {
		return market.Dataset{}, errors.New("CSV contains no positive PriceUSD values")
	}

	prices := make([]market.PricePoint, 0, len(byDate))
	for _, point := range byDate {
		prices = append(prices, point)
	}
	sort.Slice(prices, func(i, j int) bool {
		return prices[i].Timestamp.Before(prices[j].Timestamp)
	})

	generatedAt = generatedAt.UTC().Truncate(time.Second)
	return market.Dataset{
		Version:   1,
		Asset:     "bitcoin",
		Quote:     "usd",
		Interval:  "1d",
		Source:    "coinmetrics-community-data",
		SourceURL: sourceURL,
		UpdatedAt: &generatedAt,
		Prices:    prices,
	}, nil
}

func columnIndex(header []string, name string) int {
	for index, value := range header {
		if strings.TrimSpace(value) == name {
			return index
		}
	}
	return -1
}

func writeAtomic(path string, value any) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)

	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Chmod(temporaryPath, 0o644); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}
