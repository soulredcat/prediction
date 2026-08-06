# BTC Cycle Prediction Dashboard

A full-screen, single-binary Go dashboard with Bitcoin as the only priced asset and the only projected cycle model.

## Hardcoded BTC cycle model

- ATH anchor: `2017-12-16T00:00:00Z`
- ATH → low: `370` days
- low → ATH: `1,055.5` days
- full cycle: `1,425.5` days
- tolerance window: `±30` days
- projection horizon: through year `2200`

The BTC price line stops at the final historical data point. ATH and low date markers continue through year 2200 without inventing a future price path.

## One chart with optional historical comparisons

BTC remains the main chart and the vertical axis always shows BTC/USD. Optional checkboxes add these daily historical shape overlays to the same chart:

- Gold (XAU/USD)
- Nasdaq-100
- Nominal Broad U.S. Dollar Index
- WTI crude oil

Comparison prices are never shown on the BTC axis. Each enabled series is independently normalized to its own historical range so the overlay communicates timing and direction only. Comparison and BTC lines stop at the final BTC snapshot date; none of the comparison assets is projected into the future.

Static comparison snapshots are stored under:

```text
data/comparisons/
```

## Static data sources

- BTC/USD: Coin Metrics Community Data
- Nasdaq-100: FRED series `NASDAQ100`
- Broad USD index: FRED series `DTWEXBGS`
- WTI oil: FRED series `DCOILWTICO`
- Gold: Stooq `XAUUSD`

The running application makes no external market-data requests. GitHub Actions downloads the public CSV files, generates repository JSON snapshots, validates the project, and commits updated data. No API key is required.

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

## Chart interaction

- Drag horizontally to move through time.
- Use `+` and `−` or `Ctrl + mouse wheel` to zoom.
- Use **Fit history**, **Data end**, and **Year 2200** for navigation.
- Use **Full screen** to occupy the browser display.
- Enable comparison overlays with the checkboxes above the chart.

## API

```text
GET /healthz
GET /api/v1/prices
GET /api/v1/comparisons
GET /api/v1/cycles
```

There is no runtime data-sync endpoint and no editable model endpoint.

## Limitations

Comparison overlays are visual shape comparisons, not price forecasts, correlations, or trading signals. The fixed BTC cycle constants may be overfit because the mature-cycle sample remains small.
