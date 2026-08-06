"use strict";

const state = { prices: null, cycles: null };
const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function setBusy(busy) {
  $("sync-button").disabled = busy;
  $("sync-button").textContent = busy ? "Processing…" : "Sync prices";
}

function showError(error) {
  const element = $("error");
  if (!error) {
    element.classList.add("hidden");
    element.textContent = "";
    return;
  }
  element.textContent = error instanceof Error ? error.message : String(error);
  element.classList.remove("hidden");
}

function formatDateTime(value) {
  const date = new Date(value);
  const day = date.toISOString().slice(0, 10);
  return date.getUTCHours() === 12 ? `${day} 12:00 UTC` : day;
}

function render() {
  const prices = state.prices;
  const cycles = state.cycles;
  if (!prices || !cycles) return;

  const latest = prices.prices.at(-1);
  $("metric-model").textContent = `${cycles.model.bear_days} + ${cycles.model.bull_days} = ${cycles.cycle_days} days`;
  $("metric-points").textContent = prices.prices.length.toLocaleString("en-US");
  $("metric-price").textContent = latest ? `$${latest.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
  $("metric-cycles").textContent = `${cycles.items.length} cycles`;
  $("chart-meta").textContent = `source: ${prices.source} · updated: ${prices.updated_at ? prices.updated_at.replace("T", " ").slice(0, 19) + " UTC" : "not synced"}`;

  $("anchor-ath").value = cycles.model.anchor_ath.slice(0, 10);
  $("bear-days").value = cycles.model.bear_days;
  $("bull-days").value = cycles.model.bull_days;
  $("until-year").value = cycles.model.until_year;
  $("tolerance-days").value = cycles.model.tolerance_days;

  $("cycle-body").innerHTML = cycles.items.map((item) => `<tr>
    <td>${String(item.cycle_number).padStart(2, "0")}</td>
    <td>${formatDateTime(item.ath)}</td>
    <td>${item.window_start.slice(0, 10)} — ${item.window_end.slice(0, 10)}</td>
    <td>${formatDateTime(item.low)}</td>
  </tr>`).join("");

  if (prices.prices.length > 1) {
    $("chart-empty").classList.add("hidden");
    $("chart").classList.remove("hidden");
    renderChart(prices.prices, cycles.items);
  } else {
    $("chart-empty").classList.remove("hidden");
    $("chart").classList.add("hidden");
  }
}

function renderChart(prices, projections) {
  const root = $("chart");
  const width = Math.max(root.clientWidth - 36, 720);
  const height = Math.max(root.clientHeight - 36, 390);
  const margin = { top: 24, right: 28, bottom: 52, left: 82 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const start = new Date(prices[0].timestamp).getTime();
  const end = new Date(prices.at(-1).timestamp).getTime();
  const logs = prices.map((point) => Math.log10(point.price_usd));
  const minLog = Math.floor(Math.min(...logs));
  const maxLog = Math.ceil(Math.max(...logs));
  const x = (time) => margin.left + ((time - start) / (end - start)) * innerW;
  const y = (price) => margin.top + ((maxLog - Math.log10(price)) / (maxLog - minLog)) * innerH;
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);

  const path = prices.map((point, index) => `${index ? "L" : "M"}${x(new Date(point.timestamp).getTime()).toFixed(2)},${y(point.price_usd).toFixed(2)}`).join(" ");
  const yTicks = [];
  for (let power = minLog; power <= maxLog; power++) {
    const price = 10 ** power;
    const py = y(price);
    yTicks.push(`<line class="grid-line" x1="${margin.left}" y1="${py}" x2="${width-margin.right}" y2="${py}"/><text class="axis-label" x="${margin.left-10}" y="${py+4}" text-anchor="end">$${price.toLocaleString("en-US")}</text>`);
  }

  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const step = Math.max(1, Math.ceil((endYear - startYear) / 8));
  const xTicks = [];
  for (let year = startYear; year <= endYear; year += step) {
    const px = x(Date.UTC(year, 0, 1));
    xTicks.push(`<line class="grid-line" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height-margin.bottom}"/><text class="axis-label" x="${px}" y="${height-18}" text-anchor="middle">${year}</text>`);
  }

  const markers = [];
  for (const item of projections) {
    for (const [kind, value, css] of [["ATH", item.ath, "ath-line"], ["Low", item.low, "low-line"]]) {
      const time = new Date(value).getTime();
      if (time < start || time > end) continue;
      const px = x(time);
      markers.push(`<line class="${css}" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height-margin.bottom}"/><text class="marker-label" x="${px+4}" y="${margin.top+12}" transform="rotate(90 ${px+4} ${margin.top+12})">${esc(kind)} ${item.cycle_number}</text>`);
    }
  }

  root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bitcoin price logarithmic chart">
    ${yTicks.join("")}${xTicks.join("")}${markers.join("")}
    <path class="price-line" d="${path}"/>
    <text class="axis-label" x="${margin.left}" y="16">BTC/USD · logarithmic scale</text>
  </svg>`;
}

async function load() {
  showError(null);
  try {
    [state.prices, state.cycles] = await Promise.all([api("/api/v1/prices"), api("/api/v1/cycles")]);
    render();
  } catch (error) {
    showError(error);
  }
}

$("sync-button").addEventListener("click", async () => {
  setBusy(true);
  showError(null);
  try {
    state.prices = await api("/api/v1/market/sync?from=2010-07-17", { method: "POST" });
    render();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
});

$("model-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(null);
  const model = {
    anchor_ath: new Date(`${$("anchor-ath").value}T00:00:00Z`).toISOString(),
    bear_days: Number($("bear-days").value),
    bull_days: Number($("bull-days").value),
    until_year: Number($("until-year").value),
    tolerance_days: Number($("tolerance-days").value)
  };
  try {
    await api("/api/v1/model", { method: "PUT", body: JSON.stringify(model) });
    state.cycles = await api(`/api/v1/cycles?until_year=${model.until_year}`);
    render();
  } catch (error) {
    showError(error);
  }
});

window.addEventListener("resize", () => {
  if (state.prices?.prices.length > 1) renderChart(state.prices.prices, state.cycles.items);
});
void load();
