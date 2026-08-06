package main

import (
	"strings"
	"testing"
	"time"
)

func TestParseFRED(t *testing.T) {
	input := "observation_date,NASDAQ100\n2010-07-17,100\n2010-07-19,101.5\n2010-07-20,.\n"
	points, err := parseCSV(strings.NewReader(input), "fred", "NASDAQ100", time.Date(2010, 7, 18, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 1 || points[0].Date != "2010-07-19" || points[0].Value != 101.5 {
		t.Fatalf("points = %#v", points)
	}
}

func TestParseStooq(t *testing.T) {
	input := "Date,Open,High,Low,Close\n2010-07-19,1,2,0.5,1.5\n"
	points, err := parseCSV(strings.NewReader(input), "stooq", "", time.Date(2010, 7, 18, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 1 || points[0].Value != 1.5 {
		t.Fatalf("points = %#v", points)
	}
}
