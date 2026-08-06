# BTC Cycle Prediction Dashboard

A single-binary Go web dashboard for comparing actual Bitcoin price history against a fixed-time cycle model:

- ATH → low: `370` days
- low → ATH: `1,055.5` days
- full cycle: `1,425.5` days
- default anchor: `2017-12-16T00:00:00Z`
- projection horizon: through year `2200`

## Why a single Go service

This dashboard does not require a heavy frontend framework. Go serves both the API and the embedded static dashboard from one binary. Operations are simpler than maintaining separate backend and frontend deployments for a workload that primarily consists of a chart, a configuration form, and a projection table.

Bitcoin prices are stored in JSON as required:

```text
data/btc_prices.json
```

File updates use a temporary file, `fsync`, and atomic rename to reduce the risk of JSON corruption if the process stops during a write.

## Run the application

```bash
cp .env.example .env
# Set COINGECKO_API_KEY when required.
docker compose up --build
```

Open:

```text
http://localhost:8080
```

Or run without Docker:

```bash
make run
```

## Synchronize price data

Click **Sync prices** in the dashboard, or run:

```bash
curl -X POST "http://localhost:8080/api/v1/market/sync?from=2010-07-17"
```

CoinGecko is used because it provides Bitcoin history from before modern exchanges such as Binance offered a BTC/USDT market. The API key is sent through request headers and is never written to JSON.

## API

```text
GET  /healthz
GET  /api/v1/prices
POST /api/v1/market/sync?from=2010-07-17&to=2026-08-06
GET  /api/v1/model
PUT  /api/v1/model
GET  /api/v1/cycles?until_year=2200
```

## Price JSON format

```json
{
  "version": 1,
  "asset": "bitcoin",
  "quote": "usd",
  "source": "coingecko",
  "updated_at": "2026-08-06T00:00:00Z",
  "prices": [
    {
      "timestamp": "2011-06-08T00:00:00Z",
      "date": "2011-06-08",
      "price_usd": 31.91
    }
  ]
}
```

## Limitations

The model projects dates, not future prices. The mature-cycle dataset is still small, so the `370 / 1,055.5` constants may be overfit. Treat the output as a time window, not as a deterministic trading signal.
