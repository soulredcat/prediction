"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.2425 * DAY_MS;
const END_TIME = Date.UTC(2200, 11, 31, 23, 59, 59);
const COMPARISON_ORDER = ["gold", "nasdaq100", "usd_index", "wti"];

const state = {
  prices: null,
  cycles: null,
  comparisons: [],
  activeComparisons: new Set(),
  pixelsPerYear: 82,
  minPixelsPerYear: 20,
  maxPixelsPerYear: 360,
  chart: null,
  initialised: false,
  dragging: false,
  dragStartX: 0,
  dragStartScrollLeft: 0
};

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

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function safeClass(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
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

function formatDate(value, compact = false) {
  const date = new Date(value);
  const formatter = compact ? compactDateFormatter : longDateFormatter;
  const label = formatter.format(date);
  return date.getUTCHours() === 12 ? `${label} 12:00 UTC` : label;
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

function orderedComparisons(series) {
  return [...series].sort((left, right) => {
    const leftIndex = COMPARISON_ORDER.indexOf(left.id);
    const rightIndex = COMPARISON_ORDER.indexOf(right.id);
    const leftRank = leftIndex < 0 ? 999 : leftIndex;
    const rightRank = rightIndex < 0 ? 999 : rightIndex;
    return leftRank - rightRank || left.label.localeCompare(right.label);
  });
}

function renderComparisonControls() {
  const root = $("comparison-controls");
  const series = orderedComparisons(state.comparisons);
  if (!series.length) {
    root.textContent = "No comparison snapshots found.";
    return;
  }

  root.innerHTML = series.map((item) => {
    const css = safeClass(item.id);
    return `<label class="series-toggle" title="${escapeHTML(item.source)}">
      <input type="checkbox" data-series-id="${escapeHTML(item.id)}">
      <i class="comparison-swatch comparison-${css}"></i>
      ${escapeHTML(item.label)}
    </label>`;
  }).join("");

  root.querySelectorAll("input[data-series-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.seriesId;
      if (input.checked) state.activeComparisons.add(id);
      else state.activeComparisons.delete(id);
      renderChart({ preserveCenter: true });
    });
  });
}

function updateStatus() {
  const prices = state.prices;
  const cycles = state.cycles;
  if (!prices || !cycles) return;
  const first = prices.prices.at(0);
  const latest = prices.prices.at(-1);
  $("model-status").textContent = `${cycles.model.bear_days} + ${cycles.model.bull_days} = ${cycles.cycle_days} days`;
  $("data-status").textContent = first && latest ? `${formatDate(first.timestamp, true)} → ${formatDate(latest.timestamp, true)}` : "No price data";
  $("zoom-status").textContent = `${Math.round(state.pixelsPerYear)} px/year`;
  const activeLabels = orderedComparisons(state.comparisons)
    .filter((item) => state.activeComparisons.has(item.id))
    .map((item) => item.label);
  $("comparison-status").textContent = activeLabels.length ? `Overlay: ${activeLabels.join(", ")}` : "No comparison overlays";
  $("chart-meta").textContent = `${prices.source} · ${prices.prices.length.toLocaleString("en-GB")} daily BTC prices · price line stops at ${latest ? formatDate(latest.timestamp) : "no data"} · ATH and low dates continue through 2200`;
}

function xTickStep() {
  if (state.pixelsPerYear >= 220) return 1;
  if (state.pixelsPerYear >= 110) return 2;
  if (state.pixelsPerYear >= 55) return 5;
  return 10;
}

function comparisonOverlay(series, start, dataEnd, minLog, maxLog, x, y) {
  const points = series.points.filter((point) => {
    const timestamp = new Date(point.timestamp).getTime();
    return timestamp >= start && timestamp <= dataEnd && Number.isFinite(point.value);
  });
  if (points.length < 2 || points[0].value === 0) return "";

  const baseline = points[0].value;
  const values = points.map((point) => point.value / baseline - 1);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum === minimum) return "";

  const logSpan = maxLog - minLog;
  const displayMinLog = minLog + logSpan * 0.09;
  const displaySpan = logSpan * 0.82;
  const path = points.map((point, index) => {
    const relative = point.value / baseline - 1;
    const ratio = (relative - minimum) / (maximum - minimum);
    const displayPrice = 10 ** (displayMinLog + ratio * displaySpan);
    return `${index ? "L" : "M"}${x(new Date(point.timestamp).getTime()).toFixed(2)},${y(displayPrice).toFixed(2)}`;
  }).join(" ");

  const last = points.at(-1);
  const lastRelative = last.value / baseline - 1;
  const lastRatio = (lastRelative - minimum) / (maximum - minimum);
  const lastDisplayPrice = 10 ** (displayMinLog + lastRatio * displaySpan);
  const css = safeClass(series.id);
  const change = `${lastRelative >= 0 ? "+" : ""}${(lastRelative * 100).toFixed(1)}%`;
  const title = `${series.label}: shape-only overlay, ${change} from ${formatDate(points[0].timestamp, true)} to ${formatDate(last.timestamp, true)}`;

  return `<path class="comparison-line comparison-${css}" d="${path}"><title>${escapeHTML(title)}</title></path>
    <text class="comparison-end-label comparison-${css}-text" x="${x(new Date(last.timestamp).getTime()) + 7}" y="${y(lastDisplayPrice) - 6}">${escapeHTML(series.label)} ${escapeHTML(change)}</text>`;
}

function renderChart(options = {}) {
  const prices = state.prices?.prices || [];
  const projections = state.cycles?.items || [];
  const viewport = $("chart-viewport");
  const canvas = $("chart-canvas");
  const empty = $("chart-empty");

  if (prices.length < 2) {
    empty.classList.remove("hidden");
    canvas.innerHTML = "";
    return;
  }
  empty.classList.add("hidden");

  const oldWidth = state.chart?.width || viewport.scrollWidth || viewport.clientWidth;
  const oldCenterRatio = oldWidth > 0 ? (viewport.scrollLeft + viewport.clientWidth / 2) / oldWidth : 0;

  const start = new Date(prices[0].timestamp).getTime();
  const dataEnd = new Date(prices.at(-1).timestamp).getTime();
  const rangeYears = (END_TIME - start) / YEAR_MS;
  const margin = { top: 80, right: 120, bottom: 64, left: 92 };
  const width = Math.max(viewport.clientWidth, Math.ceil(rangeYears * state.pixelsPerYear) + margin.left + margin.right);
  const height = Math.max(560, viewport.clientHeight - 2);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const logs = prices.map((point) => Math.log10(point.price_usd));
  const minLog = Math.floor(Math.min(...logs));
  const maxLog = Math.ceil(Math.max(...logs));
  const x = (time) => margin.left + ((time - start) / (END_TIME - start)) * innerW;
  const y = (price) => margin.top + ((maxLog - Math.log10(price)) / (maxLog - minLog)) * innerH;
  const dataEndX = x(dataEnd);

  const pricePath = prices.map((point, index) => `${index ? "L" : "M"}${x(new Date(point.timestamp).getTime()).toFixed(2)},${y(point.price_usd).toFixed(2)}`).join(" ");

  const yTicks = [];
  for (let power = minLog; power <= maxLog; power++) {
    const price = 10 ** power;
    const py = y(price);
    yTicks.push(`<line class="grid-line" x1="${margin.left}" y1="${py}" x2="${width - margin.right}" y2="${py}"/><text class="axis-label" x="${margin.left - 11}" y="${py + 4}" text-anchor="end">$${price.toLocaleString("en-US")}</text>`);
  }

  const xTicks = [];
  const step = xTickStep();
  const firstYear = new Date(start).getUTCFullYear();
  const firstTickYear = Math.ceil(firstYear / step) * step;
  for (let year = firstTickYear; year <= 2200; year += step) {
    const px = x(Date.UTC(year, 0, 1));
    xTicks.push(`<line class="grid-line" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/><text class="axis-label" x="${px}" y="${height - 22}" text-anchor="middle">${year}</text>`);
  }

  const markers = [];
  for (const item of projections) {
    const events = [
      { kind: "ATH", value: item.ath, lineClass: "forecast-ath-line", dotClass: "ath-dot", labelClass: "ath-label", labelY: 38 },
      { kind: "LOW", value: item.low, lineClass: "forecast-low-line", dotClass: "low-dot", labelClass: "low-label", labelY: height - margin.bottom - 14 }
    ];

    for (const event of events) {
      const time = new Date(event.value).getTime();
      if (time < start || time > END_TIME) continue;
      const px = x(time);
      const label = `${event.kind} · ${formatDate(event.value, true)}`;
      let dot = "";
      if (time <= dataEnd) {
        const point = findNearestPrice(prices, time);
        dot = `<circle class="event-dot ${event.dotClass}" cx="${px}" cy="${y(point.price_usd)}" r="4.5"><title>${escapeHTML(label)}</title></circle>`;
      }
      markers.push(`<line class="${event.lineClass}" x1="${px}" y1="${margin.top}" x2="${px}" y2="${height - margin.bottom}"/>${dot}<text class="event-label ${event.labelClass}" x="${px}" y="${event.labelY}" text-anchor="middle">${escapeHTML(label)}</text>`);
    }
  }

  const comparisonPaths = orderedComparisons(state.comparisons)
    .filter((series) => state.activeComparisons.has(series.id))
    .map((series) => comparisonOverlay(series, start, dataEnd, minLog, maxLog, x, y))
    .join("");

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Horizontally scrollable Bitcoin price chart with optional shape-only comparison overlays and cycle dates through year 2200">
    <rect class="chart-background" x="0" y="0" width="${width}" height="${height}"/>
    <rect class="future-zone" x="${dataEndX}" y="${margin.top}" width="${Math.max(0, width - margin.right - dataEndX)}" height="${innerH}"/>
    ${yTicks.join("")}
    ${xTicks.join("")}
    ${markers.join("")}
    ${comparisonPaths}
    <path class="price-line" d="${pricePath}"/>
    <line class="data-end-line" x1="${dataEndX}" y1="${margin.top - 8}" x2="${dataEndX}" y2="${height - margin.bottom}"/>
    <text class="data-end-label" x="${dataEndX + 8}" y="${margin.top - 18}">Price data ends · ${escapeHTML(formatDate(prices.at(-1).timestamp, true))}</text>
    <text class="future-note" x="${dataEndX + 22}" y="${margin.top + 26}">Future area: ATH / LOW dates only — no future price or comparison lines</text>
    <text class="axis-title" x="${margin.left}" y="${margin.top - 40}">BTC/USD · logarithmic BTC price axis · comparison overlays show direction only</text>
  </svg>`;

  state.chart = { start, end: END_TIME, dataEnd, dataEndX, width, margin };
  updateStatus();

  requestAnimationFrame(() => {
    if (options.preserveCenter) {
      viewport.scrollLeft = Math.max(0, oldCenterRatio * width - viewport.clientWidth / 2);
    } else if (typeof options.scrollLeft === "number") {
      viewport.scrollLeft = Math.max(0, options.scrollLeft);
    } else if (!state.initialised) {
      state.initialised = true;
      scrollToDataEnd(false);
    }
  });
}

function setZoom(nextPixelsPerYear) {
  const next = Math.max(state.minPixelsPerYear, Math.min(state.maxPixelsPerYear, nextPixelsPerYear));
  if (Math.abs(next - state.pixelsPerYear) < 0.01) return;
  state.pixelsPerYear = next;
  renderChart({ preserveCenter: true });
}

function fitHistory() {
  const prices = state.prices?.prices || [];
  if (prices.length < 2) return;
  const viewport = $("chart-viewport");
  const start = new Date(prices[0].timestamp).getTime();
  const dataEnd = new Date(prices.at(-1).timestamp).getTime();
  const historyYears = Math.max(1, (dataEnd - start) / YEAR_MS);
  state.pixelsPerYear = Math.max(state.minPixelsPerYear, Math.min(state.maxPixelsPerYear, (viewport.clientWidth - 190) / historyYears));
  renderChart({ scrollLeft: 0 });
}

function scrollToDataEnd(smooth = true) {
  const viewport = $("chart-viewport");
  const chart = state.chart;
  if (!chart) return;
  viewport.scrollTo({
    left: Math.max(0, chart.dataEndX - viewport.clientWidth * 0.72),
    behavior: smooth ? "smooth" : "auto"
  });
}

function scrollToYear2200() {
  const viewport = $("chart-viewport");
  viewport.scrollTo({ left: viewport.scrollWidth - viewport.clientWidth, behavior: "smooth" });
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    showError(error);
  }
}

function bindInteractions() {
  const viewport = $("chart-viewport");

  $("zoom-in").addEventListener("click", () => setZoom(state.pixelsPerYear * 1.35));
  $("zoom-out").addEventListener("click", () => setZoom(state.pixelsPerYear / 1.35));
  $("fit-history").addEventListener("click", fitHistory);
  $("go-data-end").addEventListener("click", () => scrollToDataEnd(true));
  $("go-2200").addEventListener("click", scrollToYear2200);
  $("toggle-fullscreen").addEventListener("click", toggleFullscreen);

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragStartScrollLeft = viewport.scrollLeft;
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    viewport.scrollLeft = state.dragStartScrollLeft - (event.clientX - state.dragStartX);
  });

  const stopDragging = (event) => {
    if (!state.dragging) return;
    state.dragging = false;
    viewport.classList.remove("dragging");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);

  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(event.deltaY < 0 ? state.pixelsPerYear * 1.12 : state.pixelsPerYear / 1.12);
  }, { passive: false });

  document.addEventListener("fullscreenchange", () => {
    $("toggle-fullscreen").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
    setTimeout(() => renderChart({ preserveCenter: true }), 50);
  });

  window.addEventListener("resize", () => renderChart({ preserveCenter: true }));
}

async function load() {
  showError(null);
  bindInteractions();
  try {
    const [prices, cycles, comparisons] = await Promise.all([
      api("/api/v1/prices"),
      api("/api/v1/cycles"),
      api("/api/v1/comparisons")
    ]);
    state.prices = prices;
    state.cycles = cycles;
    state.comparisons = comparisons.series || [];
    renderComparisonControls();
    renderChart();
  } catch (error) {
    showError(error);
  }
}

void load();
