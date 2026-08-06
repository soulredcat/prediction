SHELL := /bin/bash

.PHONY: run test build import-prices refresh-prices docker-up docker-down

run:
	go run ./cmd/server

test:
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

docker-up:
	docker compose up --build

docker-down:
	docker compose down
