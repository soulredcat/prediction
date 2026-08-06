SHELL := /bin/bash

.PHONY: run test build import-prices refresh-prices import-comparison refresh-comparisons docker-up docker-down

run:
	go run ./cmd/server

test:
	node --check web/app.js
	go test ./...
	go vet ./...

build:
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/prediction ./cmd/server

import-prices:
	@test -n "$(CSV)" || (echo "usage: make import-prices CSV=/path/to/btc.csv" && exit 1)
	go run ./cmd/import-prices -input "$(CSV)" -output ./data/btc_prices.json

refresh-prices:
	curl --fail --location --retry 3 https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv --output /tmp/btc.csv
	$(MAKE) import-prices CSV=/tmp/btc.csv

import-comparison:
	@test -n "$(ID)" || (echo "ID is required" && exit 1)
	@test -n "$(LABEL)" || (echo "LABEL is required" && exit 1)
	@test -n "$(CSV)" || (echo "CSV is required" && exit 1)
	@test -n "$(SOURCE)" || (echo "SOURCE is required" && exit 1)
	go run ./cmd/import-comparisons -id "$(ID)" -label "$(LABEL)" -input "$(CSV)" -format "$(FORMAT)" -value-column "$(COLUMN)" -source "$(SOURCE)" -source-url "$(SOURCE_URL)" -output "./data/comparisons/$(ID).json"

refresh-comparisons:
	@echo "Run the refresh-static-comparisons GitHub Actions workflow to refresh all public snapshots."

docker-up:
	docker compose up --build

docker-down:
	docker compose down
