"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.2425 * DAY_MS;
const END_TIME = Date.UTC(2200, 11, 31, 23, 59, 59);

const state = {
  prices: null,
  cycles: null,
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

function updateStatus() {
  const prices = state.prices;
  const cycles = state.cycles;
  if (!prices || !cycles) return;
  const first = prices.prices.at(0);
  const latest = prices.prices.at(-1);
  $("model-status").textContent = `${cycles.model.bear_days} + ${cycles.model.bull_days} = ${cycles.cycle_days} days`;
  $("data-status").textContent = first && latest ? `${formatDate(first.timestamp, true)} → ${formatDate(latest.timestamp, true)}` : "No price data";
  $("zoom-status").textContent = `${Math.round(state.pixelsPerYear)} px/year`;
  $("chart-meta").textContent = `${prices.source} · ${prices.prices.length.toLocaleString("en-GB")} daily prices · price line stops at ${latest ? formatDate(latest.timestamp) : "no data"} · ATH and low dates continue through 2200`;
}

function xTickStep() {
  if (state.pixelsPerYear >= 220) return 1;
  if (state.pixelsPerYear >= 110) return 2;
  if (state.pixelsPerYear >= 55) return 5;
  return 10;
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
  const margin = { top: 80, right: 90, bottom: 64, left: 92 };
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

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Horizontally scrollable Bitcoin price chart with ATH and low dates through year 2200">
    <rect class="chart-background" x="0" y="0" width="${width}" height="${height}"/>
    <rect class="future-zone" x="${dataEndX}" y="${margin.top}" width="${Math.max(0, width - margin.right - dataEndX)}" height="${innerH}"/>
    ${yTicks.join("")}
    ${xTicks.join("")}
    ${markers.join("")}
    <path class="price-line" d="${pricePath}"/>
    <line class="data-end-line" x1="${dataEndX}" y1="${margin.top - 8}" x2="${dataEndX}" y2="${height - margin.bottom}"/>
    <text class="data-end-label" x="${dataEndX + 8}" y="${margin.top - 18}">Price data ends · ${escapeHTML(formatDate(prices.at(-1).timestamp, true))}</text>
    <text class="future-note" x="${dataEndX + 22}" y="${margin.top + 26}">Future area: ATH / LOW dates only — no future price line</text>
    <text class="axis-title" x="${margin.left}" y="${margin.top - 40}">BTC/USD · logarithmic price scale · drag horizontally · use + / − to zoom</text>
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
    [state.prices, state.cycles] = await Promise.all([
      api("/api/v1/prices"),
      api("/api/v1/cycles")
    ]);
    renderChart();
  } catch (error) {
    showError(error);
  }
}

void load();
