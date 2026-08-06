"use strict";

const state = { prices: null, cycles: null, timeline: null, timelineInitialised: false };
const $ = (id) => document.getElementById(id);
const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});
const compactDateFormatter = new Intl.DateTimeFormat("en-GB", {
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

function formatCompactDate(value) {
  const date = new Date(value);
  const label = compactDateFormatter.format(date);
  return date.getUTCHours() === 12 ? `${label} 12:00` : label;
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
  $("metric-points").textContent = prices.prices.length.toLocaleString("en-GB");
  $("metric-price").textContent = latest ? `$${latest.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
  $("metric-cycles").textContent = `${cycles.items.length} cycles · through ${cycles.model.until_year}`;

  const range = first && latest ? `${formatDateOnly(first.timestamp)} → ${formatDateOnly(latest.timestamp)}` : "empty dataset";
  const updated = prices.updated_at ? formatDateTime(prices.updated_at) : "repository snapshot";
  $("chart-meta").textContent = `${prices.source} · ${range} · generated ${updated}`;

  if (firstProjection && lastProjection) {
    const summary = `All ${cycles.items.length} cycles are displayed. First ATH: ${formatDateTime(firstProjection.ath)}. Final ATH: ${formatDateTime(lastProjection.ath)}. Final low: ${formatDateTime(lastProjection.low)}.`;
    $("projection-meta").textContent = summary;
    $("timeline-meta").textContent = `Horizontal date-only forecast from ${formatDateTime(firstProjection.ath)} to ${formatDateTime(lastProjection.low)}. Scroll sideways to inspect every cycle.`;
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
    renderHistoricalChart(prices.prices, cycles.items);
  } else {
    $("chart-empty").classList.remove("hidden");
    $("chart").classList.add("hidden");
  }

  renderForecastTimeline(cycles.items, latest?.timestamp || null);
}

function findNearestPrice(prices, timestamp) {
  let low = 0;
  let high = prices.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = new Date(prices[middle].timestamp).getTime();
    if (value === timestamp) return prices[middle];
    if (value < timestamp) low = middle + 1;
    else high = middle - 1;
  }
  const before = prices[Math.max(0, high)];
  const after = prices[Math.min(prices.length - 1, low)];
  return Math.abs(new Date(before.timestamp).getTime() - timestamp) <= Math.abs(new Date(after.timestamp).getTime() - timestamp) ? before : after;
}

function renderHistoricalChart(prices, projections) {
  const root = $("chart");
  const width = Math.max(root.clientWidth - 36, 720);
  const height = Math.max(root.clientHeight - 36, 390);
  const margin = { top: 34, right: 28, bottom: 52, left: 82 };
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
    for (const [kind, value, css] of [["ATH", item.ath, "ath"], ["Low", item.low, "low"]]) {
      const time = new Date(value).getTime();
      if (time < start || time > end) continue;
      const point = findNearestPrice(prices, time);
      const px = x(time);
      const py = y(point.price_usd);
      const labelY = kind === "ATH" ? Math.max(margin.top + 14, py - 18) : Math.min(height - margin.bottom - 8, py + 27);
      const label = `${kind} · ${formatCompactDate(value)}`;
      markers.push(`<line class="${css}-line" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/>
        <circle class="historical-marker ${css}-marker" cx="${px}" cy="${py}" r="4.5"><title>${esc(label)}</title></circle>
        <text class="historical-marker-label ${css}-text" x="${px}" y="${labelY}" text-anchor="middle">${esc(label)}</text>`);
    }
  }

  root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bitcoin historical price logarithmic chart">
    ${yTicks.join("")}${xTicks.join("")}${markers.join("")}
    <path class="price-line" d="${path}"/>
    <text class="axis-label" x="${margin.left}" y="18">BTC/USD · logarithmic scale · historical prices only</text>
  </svg>`;
}

function renderForecastTimeline(projections, dataEndValue) {
  const viewport = $("forecast-timeline");
  const canvas = $("forecast-timeline-canvas");
  if (!projections.length) {
    canvas.textContent = "No cycle projections available.";
    return;
  }

  const start = new Date(projections[0].ath).getTime();
  const end = new Date(projections.at(-1).low).getTime();
  const years = (end - start) / (365.2425 * 24 * 60 * 60 * 1000);
  const width = Math.max(4200, Math.ceil(years * 54));
  const height = 360;
  const margin = { top: 58, right: 80, bottom: 58, left: 80 };
  const innerW = width - margin.left - margin.right;
  const athY = 112;
  const lowY = 244;
  const x = (time) => margin.left + ((time - start) / (end - start)) * innerW;
  const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);

  const ticks = [];
  const firstTickYear = Math.ceil(new Date(start).getUTCFullYear() / 10) * 10;
  const lastTickYear = new Date(end).getUTCFullYear();
  for (let year = firstTickYear; year <= lastTickYear; year += 10) {
    const px = x(Date.UTC(year, 0, 1));
    ticks.push(`<line class="timeline-grid" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/><text class="timeline-year" x="${px}" y="${height - 22}" text-anchor="middle">${year}</text>`);
  }

  const phases = [];
  const events = [];
  projections.forEach((item, index) => {
    const athTime = new Date(item.ath).getTime();
    const lowTime = new Date(item.low).getTime();
    const athX = x(athTime);
    const lowX = x(lowTime);
    const nextATH = projections[index + 1] ? x(new Date(projections[index + 1].ath).getTime()) : null;

    phases.push(`<line class="timeline-bear-phase" x1="${athX}" y1="${athY}" x2="${lowX}" y2="${lowY}"/>`);
    if (nextATH !== null) {
      phases.push(`<line class="timeline-bull-phase" x1="${lowX}" y1="${lowY}" x2="${nextATH}" y2="${athY}"/>`);
    }

    const cycle = String(item.cycle_number).padStart(2, "0");
    const athLabel = `Cycle ${cycle} · ATH · ${formatCompactDate(item.ath)}`;
    const lowLabel = `Cycle ${cycle} · Low · ${formatCompactDate(item.low)}`;
    events.push(`<circle class="timeline-node timeline-ath-node" cx="${athX}" cy="${athY}" r="6"><title>${esc(formatDateTime(item.ath))}</title></circle>
      <text class="timeline-event-label timeline-ath-label" x="${athX}" y="${athY - 30}" text-anchor="middle"><tspan x="${athX}" dy="0">Cycle ${cycle} · ATH</tspan><tspan x="${athX}" dy="15">${esc(formatCompactDate(item.ath))}</tspan></text>
      <circle class="timeline-node timeline-low-node" cx="${lowX}" cy="${lowY}" r="6"><title>${esc(formatDateTime(item.low))}</title></circle>
      <text class="timeline-event-label timeline-low-label" x="${lowX}" y="${lowY + 29}" text-anchor="middle"><tspan x="${lowX}" dy="0">Cycle ${cycle} · Low</tspan><tspan x="${lowX}" dy="15">${esc(formatCompactDate(item.low))}</tspan></text>`);
  });

  let dataEndOverlay = "";
  let dataEndX = margin.left;
  if (dataEndValue) {
    const dataEnd = new Date(dataEndValue).getTime();
    const clamped = Math.max(start, Math.min(end, dataEnd));
    dataEndX = x(clamped);
    dataEndOverlay = `<rect class="timeline-future-zone" x="${dataEndX}" y="${margin.top}" width="${Math.max(0, width - margin.right - dataEndX)}" height="${height - margin.top - margin.bottom}"/>
      <line class="timeline-data-end" x1="${dataEndX}" y1="${margin.top - 10}" x2="${dataEndX}" y2="${height - margin.bottom}"/>
      <text class="timeline-data-end-label" x="${dataEndX + 8}" y="${margin.top - 18}">Historical data ends · ${esc(formatCompactDate(dataEndValue))}</text>`;
  }

  canvas.style.width = `${width}px`;
  canvas.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected ATH and low timeline through year 2200">
    <rect class="timeline-background" x="0" y="0" width="${width}" height="${height}"/>
    ${dataEndOverlay}
    ${ticks.join("")}
    <line class="timeline-lane" x1="${margin.left}" y1="${athY}" x2="${width - margin.right}" y2="${athY}"/>
    <line class="timeline-lane" x1="${margin.left}" y1="${lowY}" x2="${width - margin.right}" y2="${lowY}"/>
    <text class="timeline-lane-label" x="18" y="${athY + 4}">ATH</text>
    <text class="timeline-lane-label" x="18" y="${lowY + 4}">LOW</text>
    ${phases.join("")}
    ${events.join("")}
  </svg>`;

  state.timeline = { viewport, width, dataEndX };
  if (!state.timelineInitialised) {
    state.timelineInitialised = true;
    requestAnimationFrame(() => scrollTimeline("current"));
  }
}

function scrollTimeline(target) {
  const timeline = state.timeline;
  if (!timeline) return;
  let left = 0;
  if (target === "current") left = timeline.dataEndX - timeline.viewport.clientWidth * 0.3;
  if (target === "end") left = timeline.width - timeline.viewport.clientWidth;
  timeline.viewport.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

$("timeline-start").addEventListener("click", () => scrollTimeline("start"));
$("timeline-current").addEventListener("click", () => scrollTimeline("current"));
$("timeline-end").addEventListener("click", () => scrollTimeline("end"));

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
  if (!state.prices || !state.cycles) return;
  if (state.prices.prices.length > 1) renderHistoricalChart(state.prices.prices, state.cycles.items);
});

void load();
