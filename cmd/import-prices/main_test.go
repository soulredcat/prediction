package main

import (
	"strings"
	"testing"
	"time"
)

func TestImportCSVSkipsRowsWithoutMarketPrice(t *testing.T) {
	input := strings.NewReader("time,PriceUSD,Other\n2009-01-03,,genesis\n2010-07-18,0.08584,a\n2010-07-19,0.08080,b\n")
	generatedAt := time.Date(2026, time.August, 6, 12, 0, 0, 0, time.UTC)

	dataset, err := importCSV(input, defaultSourceURL, generatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(dataset.Prices), 2; got != want {
		t.Fatalf("price count: got %d want %d", got, want)
	}
	if got, want := dataset.Prices[0].Date, "2010-07-18"; got != want {
		t.Fatalf("first price date: got %s want %s", got, want)
	}
	if got, want := dataset.Interval, "1d"; got != want {
		t.Fatalf("interval: got %s want %s", got, want)
	}
	if dataset.UpdatedAt == nil || !dataset.UpdatedAt.Equal(generatedAt) {
		t.Fatalf("unexpected updated_at: %v", dataset.UpdatedAt)
	}
}

func TestImportCSVRequiresColumns(t *testing.T) {
	_, err := importCSV(strings.NewReader("date,close\n2010-07-18,0.08\n"), defaultSourceURL, time.Now())
	if err == nil {
		t.Fatal("expected missing-column error")
	}
}
