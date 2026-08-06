"use strict";

const state = { prices: null, cycles: null };
const $ = (id) => document.getElementById(id);
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

async function api(path) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
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
  const label = longDateFormatter.format(date);
  return date.getUTCHours() === 12 ? `${label}, 12:00 UTC` : label;
}

function formatDateOnly(value) {
  return longDateFormatter.format(new Date(value));
}

function formatShortDate(value) {
  return shortDateFormatter.format(new Date(value));
}

function render() {
  const prices = state.prices;
  const cycles = state.cycles;
  if (!prices || !cycles) return;

  const latest = prices.prices.at(-1);
  const first = prices.prices.at(0);
  const firstProjection = cycles.items.at(0);
  const lastProjection = cycles.items.at(-1);

  $("metric-model").textContent = `${cycles.model.bear_days} + ${cycles.model.bull_days} = ${cycles.cycle_days} days`;
  $("metric-points").textContent = prices.prices.length.toLocaleString("en-US");
  $("metric-price").textContent = latest ? `$${latest.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
  $("metric-cycles").textContent = `${cycles.items.length} cycles · through ${cycles.model.until_year}`;

  const range = first && latest ? `${formatDateOnly(first.timestamp)} → ${formatDateOnly(latest.timestamp)}` : "empty dataset";
  const updated = prices.updated_at ? formatDateTime(prices.updated_at) : "repository snapshot";
  $("chart-meta").textContent = `${prices.source} · ${range} · generated ${updated}`;

  if (firstProjection && lastProjection) {
    $("projection-meta").textContent = `All ${cycles.items.length} cycles are displayed. First ATH: ${formatDateTime(firstProjection.ath)}. Final ATH: ${formatDateTime(lastProjection.ath)}. Final low: ${formatDateTime(lastProjection.low)}.`;
  }

  $("cycle-body").innerHTML = cycles.items.map((item) => `<tr>
    <td>${String(item.cycle_number).padStart(2, "0")}</td>
    <td>${formatDateTime(item.ath)}</td>
    <td>${formatDateOnly(item.window_start)} — ${formatDateOnly(item.window_end)}</td>
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
  const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);

  const path = prices.map((point, index) => `${index ? "L" : "M"}${x(new Date(point.timestamp).getTime()).toFixed(2)},${y(point.price_usd).toFixed(2)}`).join(" ");
  const yTicks = [];
  for (let power = minLog; power <= maxLog; power++) {
    const price = 10 ** power;
    const py = y(price);
    yTicks.push(`<line class="grid-line" x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}"/><text class="axis-label" x="${margin.left - 10}" y="${py + 4}" text-anchor="end">$${price.toLocaleString("en-US")}</text>`);
  }

  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const step = Math.max(1, Math.ceil((endYear - startYear) / 8));
  const xTicks = [];
  for (let year = startYear; year <= endYear; year += step) {
    const px = x(Date.UTC(year, 0, 1));
    xTicks.push(`<line class="grid-line" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/><text class="axis-label" x="${px}" y="${height - 18}" text-anchor="middle">${year}</text>`);
  }

  const markers = [];
  for (const item of projections) {
    for (const [kind, value, css] of [["ATH", item.ath, "ath-line"], ["Low", item.low, "low-line"]]) {
      const time = new Date(value).getTime();
      if (time < start || time > end) continue;
      const px = x(time);
      const label = `${kind} ${item.cycle_number} · ${formatShortDate(value)}`;
      markers.push(`<line class="${css}" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/><text class="marker-label" x="${px + 4}" y="${margin.top + 12}" transform="rotate(90 ${px + 4} ${margin.top + 12})">${esc(label)}</text>`);
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
    [state.prices, state.cycles] = await Promise.all([
      api("/api/v1/prices"),
      api("/api/v1/cycles")
    ]);
    render();
  } catch (error) {
    showError(error);
  }
}

window.addEventListener("resize", () => {
  if (state.prices?.prices.length > 1) renderChart(state.prices.prices, state.cycles.items);
});

void load();
