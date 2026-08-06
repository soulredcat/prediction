package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/soulredcat/prediction/internal/comparison"
)

func main() {
	var (
		id          = flag.String("id", "", "stable series id")
		label       = flag.String("label", "", "display label")
		input       = flag.String("input", "", "input CSV path")
		output      = flag.String("output", "", "output JSON path")
		format      = flag.String("format", "fred", "CSV format: fred or stooq")
		valueColumn = flag.String("value-column", "", "CSV value column")
		source      = flag.String("source", "", "source label")
		sourceURL   = flag.String("source-url", "", "source URL")
		fromRaw     = flag.String("from", "2010-07-18", "first accepted date")
	)
	flag.Parse()

	if *id == "" || *label == "" || *input == "" || *output == "" || *source == "" {
		fatalf("id, label, input, output, and source are required")
	}
	from, err := time.Parse("2006-01-02", *fromRaw)
	if err != nil {
		fatalf("parse from: %v", err)
	}

	file, err := os.Open(*input)
	if err != nil {
		fatalf("open input: %v", err)
	}
	defer file.Close()

	points, err := parseCSV(file, strings.ToLower(*format), *valueColumn, from.UTC())
	if err != nil {
		fatalf("parse input: %v", err)
	}
	if len(points) == 0 {
		fatalf("input produced zero points")
	}

	series := comparison.Series{
		Version:   1,
		ID:        *id,
		Label:     *label,
		Interval:  "1d",
		Source:    *source,
		SourceURL: *sourceURL,
		UpdatedAt: time.Now().UTC(),
		Points:    points,
	}
	if err := comparison.Validate(series); err != nil {
		fatalf("validate output: %v", err)
	}
	if err := writeJSON(*output, series); err != nil {
		fatalf("write output: %v", err)
	}
	fmt.Printf("wrote %d points to %s\n", len(points), *output)
}

func parseCSV(reader io.Reader, format, valueColumn string, from time.Time) ([]comparison.Point, error) {
	csvReader := csv.NewReader(reader)
	csvReader.TrimLeadingSpace = true
	header, err := csvReader.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	if len(header) < 2 {
		return nil, fmt.Errorf("CSV must contain at least two columns")
	}

	dateName := "observation_date"
	if format == "stooq" {
		dateName = "Date"
		if valueColumn == "" {
			valueColumn = "Close"
		}
	} else if format != "fred" {
		return nil, fmt.Errorf("unsupported format %q", format)
	}
	if valueColumn == "" {
		valueColumn = header[1]
	}

	dateIndex := indexOf(header, dateName)
	valueIndex := indexOf(header, valueColumn)
	if dateIndex < 0 || valueIndex < 0 {
		return nil, fmt.Errorf("required columns not found: date=%q value=%q header=%v", dateName, valueColumn, header)
	}

	byDate := make(map[string]comparison.Point)
	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read row: %w", err)
		}
		if dateIndex >= len(record) || valueIndex >= len(record) {
			continue
		}
		date, err := time.Parse("2006-01-02", strings.TrimSpace(record[dateIndex]))
		if err != nil || date.Before(from) {
			continue
		}
		raw := strings.TrimSpace(record[valueIndex])
		if raw == "" || raw == "." || strings.EqualFold(raw, "null") {
			continue
		}
		value, err := strconv.ParseFloat(raw, 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			continue
		}
		date = date.UTC()
		key := date.Format("2006-01-02")
		byDate[key] = comparison.Point{Timestamp: date, Date: key, Value: value}
	}

	points := make([]comparison.Point, 0, len(byDate))
	for _, point := range byDate {
		points = append(points, point)
	}
	sort.Slice(points, func(i, j int) bool { return points[i].Timestamp.Before(points[j].Timestamp) })
	return points, nil
}

func indexOf(header []string, name string) int {
	for index, value := range header {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(name)) {
			return index
		}
	}
	return -1
}

func writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
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
	return os.Rename(tempName, path)
}

func fatalf(format string, values ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", values...)
	os.Exit(1)
}
