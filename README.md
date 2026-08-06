# BTC Cycle Prediction Dashboard

Single-binary Go web dashboard untuk membandingkan harga Bitcoin aktual dengan model waktu tetap:

- ATH → low: `370` hari
- low → ATH: `1,055.5` hari
- total siklus: `1,425.5` hari
- anchor default: `2017-12-16T00:00:00Z`
- proyeksi tanggal: sampai tahun `2200`

## Kenapa single Go service

Dashboard ini tidak membutuhkan framework frontend berat. Go menyajikan API dan static dashboard dari satu binary. Operasional lebih sederhana daripada memisahkan Next.js untuk kebutuhan yang sebagian besar hanya chart, form konfigurasi, dan tabel.

Harga disimpan di JSON sesuai requirement:

```text
data/btc_prices.json
```

Penulisan file menggunakan temporary file + `fsync` + atomic rename untuk mengurangi risiko JSON korup ketika proses berhenti saat write.

## Menjalankan

```bash
cp .env.example .env
# isi COINGECKO_API_KEY bila diperlukan
docker compose up --build
```

Buka:

```text
http://localhost:8080
```

Atau tanpa Docker:

```bash
make run
```

## Sinkronisasi harga

Dari dashboard tekan **Sync harga**, atau:

```bash
curl -X POST "http://localhost:8080/api/v1/market/sync?from=2010-07-17"
```

CoinGecko dipakai karena menyediakan data historis sebelum exchange modern seperti Binance memiliki pair BTC/USDT. API key dikirim melalui header dan tidak pernah ditulis ke JSON.

## API

```text
GET  /healthz
GET  /api/v1/prices
POST /api/v1/market/sync?from=2010-07-17&to=2026-08-06
GET  /api/v1/model
PUT  /api/v1/model
GET  /api/v1/cycles?until_year=2200
```

## Format price JSON

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

## Batasan

Model menghasilkan tanggal, bukan harga masa depan. Dataset siklus matang masih kecil sehingga konstanta `370 / 1,055.5` berisiko overfitting. Gunakan sebagai window waktu, bukan sinyal trading deterministik.
