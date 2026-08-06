# BTC Cycle Prediction Dashboard

A single-binary Go dashboard that compares static Bitcoin price history with a configurable fixed-time cycle model.

- ATH → low: `370` days
- low → ATH: `1,055.5` days
- full cycle: `1,425.5` days
- default anchor: `2017-12-16T00:00:00Z`
- projection horizon: through year `2200`

## Static price data

The running application makes **no external market-data requests**. It reads the repository snapshot directly from:

```text
data/btc_prices.json
```

The JSON file contains daily BTC/USD reference prices from the earliest date for which the upstream dataset has a positive `PriceUSD` value. Bitcoin network rows before a market price existed are intentionally omitted instead of being filled with invented zero or synthetic prices.

The snapshot is generated from the Coin Metrics Community Data BTC CSV:

```text
https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv
```

External access is used only by the offline importer or the GitHub Actions refresh workflow. The dashboard itself remains deterministic and can run without internet access.

## Run

```bash
cp .env.example .env
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

## Refresh the repository snapshot

Manual local refresh:

```bash
make refresh-prices
```

Import an already downloaded Coin Metrics CSV:

```bash
make import-prices CSV=/path/to/btc.csv
```

GitHub Actions also provides the `refresh-static-btc-prices` workflow. It downloads the public CSV, generates `data/btc_prices.json`, runs validation, and commits the changed snapshot. No API key is required.

## API

```text
GET  /healthz
GET  /api/v1/prices
GET  /api/v1/model
PUT  /api/v1/model
GET  /api/v1/cycles?until_year=2200
```

There is intentionally no runtime sync endpoint.

## Price JSON format

```json
{
  "version": 1,
  "asset": "bitcoin",
  "quote": "usd",
  "interval": "1d",
  "source": "coinmetrics-community-data",
  "source_url": "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv",
  "updated_at": "2026-08-06T12:00:00Z",
  "prices": [
    {
      "timestamp": "2010-07-18T00:00:00Z",
      "date": "2010-07-18",
      "price_usd": 0.08584
    }
  ]
}
```

## Storage behavior

The model configuration remains writable through the dashboard and is stored in `data/model_config.json` using a temporary file, `fsync`, and atomic rename. The price file is read-only at runtime and is updated only through the importer.

## Limitations

The cycle model projects dates, not future prices. The mature-cycle dataset is small, so the `370 / 1,055.5` constants may be overfit. Treat the output as a research time window, not as a deterministic trading signal.
