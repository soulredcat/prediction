# BTC Cycle Prediction Dashboard

A single-binary Go dashboard that compares static Bitcoin price history with a hardcoded fixed-time cycle model.

## Hardcoded cycle model

The cycle values are intentionally fixed in source code and cannot be edited from the dashboard:

- ATH anchor: `2017-12-16T00:00:00Z`
- ATH → low: `370` days
- low → ATH: `1,055.5` days
- full cycle: `1,425.5` days
- tolerance window: `±30` days
- projection horizon: through year `2200`

The dashboard renders all `47` projected cycles. The final projected ATH is `June 28, 2197`, and the final projected low is `July 3, 2198`.

## Static price data

The running application makes no external market-data requests. It reads the repository snapshot directly from:

```text
data/btc_prices.json
```

The JSON file contains daily BTC/USD reference prices from the earliest date for which the upstream dataset has a positive `PriceUSD` value. Rows before a market price existed are intentionally omitted rather than filled with invented values.

The snapshot is generated from the Coin Metrics Community Data BTC CSV:

```text
https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv
```

External access is used only by the offline importer or the GitHub Actions refresh workflow. The dashboard itself can run without internet access.

## Run without Docker

Requirements: Go `1.23` or newer.

```powershell
git clone https://github.com/soulredcat/prediction.git
cd prediction
go run ./cmd/server
```

Open:

```text
http://localhost:8080
```

Build a Windows executable:

```powershell
go build -o prediction.exe ./cmd/server
.\prediction.exe
```

## Refresh the repository snapshot

Manual refresh:

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
GET /healthz
GET /api/v1/prices
GET /api/v1/cycles
```

There is no runtime price-sync endpoint and no model-configuration endpoint.

## Limitations

The cycle model projects dates, not future prices. The mature-cycle dataset is small, so the `370 / 1,055.5` constants may be overfit. Treat the output as a research time window, not as a deterministic trading signal.
