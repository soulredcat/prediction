SHELL := /bin/bash

.PHONY: run test build docker-up docker-down

run:
	go run ./cmd/server

test:
	go test ./...
	go vet ./...

build:
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/prediction ./cmd/server

docker-up:
	docker compose up --build

docker-down:
	docker compose down
