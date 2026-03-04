/**
 * VibeDash - LLM-powered dashboard panel for Home Assistant
 *
 * Self-contained LitElement panel that provides:
 * - Prompt input for natural language dashboard generation
 * - Chart, metric, gauge, entity list, and markdown cards
 * - WebSocket integration with VibeDash backend
 */

// ============================================================
// Chart.js CDN-free inline: We load it dynamically from HA's
// static assets or a CDN as a fallback since bundling ~200KB
// inline would be excessive. We use a lightweight SVG fallback
// for when Chart.js isn't available.
// ============================================================

const CHARTJS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
const CHARTJS_ADAPTER_URL = "https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js";

let chartJsLoaded = false;
let chartJsLoading = null;

async function ensureChartJs() {
  if (chartJsLoaded) return true;
  if (chartJsLoading) return chartJsLoading;

  chartJsLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHARTJS_URL;
    script.onload = () => {
      const adapter = document.createElement("script");
      adapter.src = CHARTJS_ADAPTER_URL;
      adapter.onload = () => {
        chartJsLoaded = true;
        resolve(true);
      };
      adapter.onerror = () => {
        chartJsLoaded = true; // Chart.js loaded, adapter failed - still usable
        resolve(true);
      };
      document.head.appendChild(adapter);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return chartJsLoading;
}

// ============================================================
// Utility: WebSocket command helper
// ============================================================

let wsCommandId = 1;

function sendWsCommand(hass, command) {
  return hass.callWS(command);
}

// ============================================================
// Simple markdown renderer (basic subset)
// ============================================================

function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

// ============================================================
// Color palette for charts
// ============================================================

const CHART_COLORS = [
  "#4fc3f7", "#81c784", "#ffb74d", "#e57373",
  "#ba68c8", "#4dd0e1", "#fff176", "#f06292",
  "#aed581", "#7986cb",
];

// ============================================================
// HA theme color helpers
// ============================================================

function getCssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

// ============================================================
// Main Panel Element
// ============================================================

class VibeDashPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._narrow = false;
    this._dashboard = null;
    this._loading = false;
    this._error = null;
    this._history = [];
  }

  set hass(value) {
    this._hass = value;
    this._updateCards();
  }

  get hass() {
    return this._hass;
  }

  set narrow(value) {
    this._narrow = value;
  }

  set panel(value) {
    this._panel = value;
  }

  set route(value) {
    this._route = value;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          --vd-bg: var(--primary-background-color, #1c1c1c);
          --vd-card-bg: var(--card-background-color, #2c2c2c);
          --vd-text: var(--primary-text-color, #e0e0e0);
          --vd-text-secondary: var(--secondary-text-color, #999);
          --vd-primary: var(--primary-color, #4fc3f7);
          --vd-divider: var(--divider-color, #333);
          --vd-radius: 12px;
          --vd-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .container {
          min-height: 100%;
          background: var(--vd-bg);
          color: var(--vd-text);
          font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
          padding: 0;
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .header {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--vd-card-bg);
          border-bottom: 1px solid var(--vd-divider);
          padding: 16px 24px;
        }

        .header-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .header-top h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 500;
          flex: 1;
        }

        .header-top .logo {
          font-size: 28px;
          line-height: 1;
        }

        /* Prompt input */
        .prompt-row {
          display: flex;
          gap: 8px;
        }

        .prompt-input {
          flex: 1;
          background: var(--vd-bg);
          border: 1px solid var(--vd-divider);
          border-radius: 24px;
          padding: 10px 20px;
          color: var(--vd-text);
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
        }

        .prompt-input:focus {
          border-color: var(--vd-primary);
        }

        .prompt-input::placeholder {
          color: var(--vd-text-secondary);
        }

        .submit-btn {
          background: var(--vd-primary);
          color: #000;
          border: none;
          border-radius: 24px;
          padding: 10px 24px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
          white-space: nowrap;
        }

        .submit-btn:hover { opacity: 0.85; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* History chips */
        .history-row {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .history-chip {
          background: var(--vd-bg);
          border: 1px solid var(--vd-divider);
          border-radius: 16px;
          padding: 4px 12px;
          font-size: 12px;
          color: var(--vd-text-secondary);
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .history-chip:hover {
          border-color: var(--vd-primary);
          color: var(--vd-text);
        }

        /* Content area */
        .content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        /* Dashboard title */
        .dashboard-title {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 20px 0;
          color: var(--vd-text);
        }

        /* Card grid */
        .card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 16px;
        }

        @media (max-width: 500px) {
          .card-grid {
            grid-template-columns: 1fr;
          }
          .header { padding: 12px 16px; }
          .content { padding: 16px; }
        }

        /* Card base */
        .card {
          background: var(--vd-card-bg);
          border-radius: var(--vd-radius);
          box-shadow: var(--vd-shadow);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .card-header {
          padding: 16px 16px 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--vd-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .card-body {
          padding: 8px 16px 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* Metric card */
        .metric-value {
          font-size: 48px;
          font-weight: 300;
          line-height: 1.1;
          color: var(--vd-text);
        }

        .metric-unit {
          font-size: 20px;
          color: var(--vd-text-secondary);
          margin-left: 4px;
        }

        .metric-name {
          font-size: 13px;
          color: var(--vd-text-secondary);
          margin-top: 4px;
        }

        /* Chart card */
        .chart-container {
          position: relative;
          width: 100%;
          height: 200px;
        }

        .chart-container canvas {
          width: 100% !important;
          height: 100% !important;
        }

        /* Gauge card */
        .gauge-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0;
        }

        .gauge-svg {
          width: 160px;
          height: 100px;
        }

        .gauge-value {
          font-size: 32px;
          font-weight: 300;
          margin-top: 4px;
        }

        .gauge-label {
          font-size: 12px;
          color: var(--vd-text-secondary);
        }

        /* Entity list card */
        .entity-table {
          width: 100%;
          border-collapse: collapse;
        }

        .entity-table tr {
          border-bottom: 1px solid var(--vd-divider);
        }

        .entity-table tr:last-child {
          border-bottom: none;
        }

        .entity-table td {
          padding: 8px 4px;
          font-size: 14px;
        }

        .entity-table .entity-name {
          color: var(--vd-text);
        }

        .entity-table .entity-state {
          text-align: right;
          font-weight: 500;
          color: var(--vd-primary);
        }

        /* Markdown card */
        .markdown-content {
          font-size: 14px;
          line-height: 1.6;
          color: var(--vd-text);
        }

        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          margin: 8px 0 4px;
          color: var(--vd-text);
        }

        .markdown-content code {
          background: var(--vd-bg);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
        }

        .markdown-content ul {
          margin: 4px 0;
          padding-left: 20px;
        }

        /* Loading state */
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          gap: 16px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--vd-divider);
          border-top-color: var(--vd-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text {
          color: var(--vd-text-secondary);
          font-size: 14px;
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          text-align: center;
          gap: 12px;
        }

        .empty-icon {
          font-size: 64px;
          opacity: 0.3;
        }

        .empty-title {
          font-size: 20px;
          font-weight: 500;
          color: var(--vd-text);
        }

        .empty-desc {
          font-size: 14px;
          color: var(--vd-text-secondary);
          max-width: 400px;
        }

        .suggestion-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
          justify-content: center;
        }

        .suggestion-chip {
          background: var(--vd-card-bg);
          border: 1px solid var(--vd-divider);
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 13px;
          color: var(--vd-text);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }

        .suggestion-chip:hover {
          border-color: var(--vd-primary);
          background: var(--vd-bg);
        }

        /* Error state */
        .error-banner {
          background: #b71c1c22;
          border: 1px solid #ef5350;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          color: #ef5350;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .error-banner .dismiss {
          margin-left: auto;
          cursor: pointer;
          opacity: 0.7;
        }

        .error-banner .dismiss:hover { opacity: 1; }

        /* Chart.js loading placeholder */
        .chart-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--vd-text-secondary);
          font-size: 13px;
        }
      </style>

      <div class="container">
        <div class="header">
          <div class="header-top">
            <span class="logo">&#x2728;</span>
            <h1>VibeDash</h1>
          </div>
          <div class="prompt-row">
            <input
              class="prompt-input"
              type="text"
              placeholder="Describe the dashboard you want... e.g. 'Show me temperature trends for the last 24 hours'"
              id="promptInput"
            />
            <button class="submit-btn" id="submitBtn">Generate</button>
          </div>
          <div class="history-row" id="historyRow"></div>
        </div>
        <div class="content" id="content">
          <div class="empty-state">
            <div class="empty-icon">&#x1F4CA;</div>
            <div class="empty-title">What would you like to see?</div>
            <div class="empty-desc">
              Describe a dashboard in natural language and the AI will generate
              charts, metrics, and insights from your Home Assistant data.
            </div>
            <div class="suggestion-chips" id="suggestions">
              <div class="suggestion-chip">Show me all temperature sensors</div>
              <div class="suggestion-chip">Energy usage this week</div>
              <div class="suggestion-chip">Battery levels for all devices</div>
              <div class="suggestion-chip">Climate overview by room</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._setupEvents();
  }

  _setupEvents() {
    const input = this.shadowRoot.getElementById("promptInput");
    const btn = this.shadowRoot.getElementById("submitBtn");
    const suggestions = this.shadowRoot.getElementById("suggestions");

    btn.addEventListener("click", () => this._submit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });

    suggestions.addEventListener("click", (e) => {
      if (e.target.classList.contains("suggestion-chip")) {
        input.value = e.target.textContent;
        this._submit();
      }
    });
  }

  async _submit() {
    const input = this.shadowRoot.getElementById("promptInput");
    const prompt = input.value.trim();
    if (!prompt || this._loading) return;

    this._loading = true;
    this._error = null;
    this._dashboard = null;
    this._renderLoading();

    // Add to history
    this._addToHistory(prompt);

    try {
      const result = await sendWsCommand(this._hass, {
        type: "vibedash/generate",
        prompt: prompt,
      });

      this._dashboard = result.dashboard;
      this._renderDashboard();
    } catch (err) {
      console.error("VibeDash generation error:", err);
      this._error = err.message || "Failed to generate dashboard";
      this._renderError();
    } finally {
      this._loading = false;
    }
  }

  _addToHistory(prompt) {
    // Keep last 5 prompts
    if (!this._history.includes(prompt)) {
      this._history.unshift(prompt);
      if (this._history.length > 5) this._history.pop();
    }
    this._renderHistoryChips();
  }

  _renderHistoryChips() {
    const row = this.shadowRoot.getElementById("historyRow");
    if (!row) return;
    row.innerHTML = this._history
      .map((p) => `<div class="history-chip">${this._escapeHtml(p)}</div>`)
      .join("");
    row.querySelectorAll(".history-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.shadowRoot.getElementById("promptInput").value = chip.textContent;
        this._submit();
      });
    });
  }

  _renderLoading() {
    const content = this.shadowRoot.getElementById("content");
    content.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <div class="loading-text">Analyzing your request and generating dashboard...</div>
        <div class="loading-text" style="font-size:12px;opacity:0.6">
          This uses two AI passes: entity selection, then dashboard generation
        </div>
      </div>
    `;
  }

  _renderError() {
    const content = this.shadowRoot.getElementById("content");
    content.innerHTML = `
      <div class="error-banner">
        <span>&#x26A0;</span>
        <span>${this._escapeHtml(this._error)}</span>
        <span class="dismiss" id="dismissError">&#x2715;</span>
      </div>
    `;
    content.querySelector("#dismissError")?.addEventListener("click", () => {
      this._error = null;
      content.querySelector(".error-banner")?.remove();
    });
  }

  _renderDashboard() {
    const content = this.shadowRoot.getElementById("content");
    if (!this._dashboard) return;

    const { title, cards } = this._dashboard;

    let html = "";
    if (title) {
      html += `<h2 class="dashboard-title">${this._escapeHtml(title)}</h2>`;
    }

    html += '<div class="card-grid">';
    (cards || []).forEach((card, i) => {
      html += `<div class="card" id="card-${i}">`;
      html += `<div class="card-header">${this._escapeHtml(card.title || "")}</div>`;
      html += `<div class="card-body" id="card-body-${i}">`;
      html += this._renderCardBody(card, i);
      html += `</div></div>`;
    });
    html += "</div>";

    content.innerHTML = html;

    // Post-render: initialize charts
    (cards || []).forEach((card, i) => {
      if (card.type === "chart") {
        this._initChart(card, i);
      }
    });
  }

  _renderCardBody(card, index) {
    switch (card.type) {
      case "metric":
        return this._renderMetric(card);
      case "gauge":
        return this._renderGauge(card, index);
      case "entity_list":
        return this._renderEntityList(card);
      case "markdown":
        return this._renderMarkdownCard(card);
      case "chart":
        return `
          <div class="chart-container" id="chart-container-${index}">
            <div class="chart-loading">Loading chart data...</div>
          </div>`;
      default:
        return `<div style="color:var(--vd-text-secondary)">Unknown card type: ${card.type}</div>`;
    }
  }

  _renderMetric(card) {
    const entity = card.entity;
    const state = this._hass?.states?.[entity];
    if (!state) {
      return `<div class="metric-value">--</div><div class="metric-name">${this._escapeHtml(entity || "")}</div>`;
    }

    const value = state.state;
    const unit = state.attributes?.unit_of_measurement || "";
    const name = state.attributes?.friendly_name || entity;

    return `
      <div class="metric-value">${this._escapeHtml(value)}<span class="metric-unit">${this._escapeHtml(unit)}</span></div>
      <div class="metric-name">${this._escapeHtml(name)}</div>
    `;
  }

  _renderGauge(card, index) {
    const entity = card.entity;
    const state = this._hass?.states?.[entity];
    const value = state ? parseFloat(state.state) : 0;
    const min = card.min ?? 0;
    const max = card.max ?? 100;
    const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const unit = state?.attributes?.unit_of_measurement || "";
    const name = state?.attributes?.friendly_name || entity;

    // SVG arc gauge
    const startAngle = -180;
    const endAngle = 0;
    const angle = startAngle + pct * (endAngle - startAngle);
    const r = 60;
    const cx = 80;
    const cy = 80;

    function polarToCartesian(a) {
      const rad = (a * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    const bgStart = polarToCartesian(startAngle);
    const bgEnd = polarToCartesian(endAngle);
    const valEnd = polarToCartesian(angle);
    const largeArc = pct > 0.5 ? 1 : 0;

    // Color based on percentage
    let color = "var(--vd-primary)";
    if (pct > 0.8) color = "#e57373";
    else if (pct > 0.6) color = "#ffb74d";
    else if (pct > 0.3) color = "#81c784";

    return `
      <div class="gauge-container">
        <svg class="gauge-svg" viewBox="0 0 160 100">
          <path d="M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}"
                fill="none" stroke="var(--vd-divider)" stroke-width="10" stroke-linecap="round"/>
          ${pct > 0.001 ? `
          <path d="M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${largeArc} 1 ${valEnd.x} ${valEnd.y}"
                fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>
          ` : ""}
        </svg>
        <div class="gauge-value">${isNaN(value) ? "--" : value}${unit ? `<span class="metric-unit">${this._escapeHtml(unit)}</span>` : ""}</div>
        <div class="gauge-label">${this._escapeHtml(name)}</div>
      </div>
    `;
  }

  _renderEntityList(card) {
    const entities = card.entities || [];
    let html = '<table class="entity-table">';

    entities.forEach((entityId) => {
      const state = this._hass?.states?.[entityId];
      const name = state?.attributes?.friendly_name || entityId;
      const value = state?.state || "unknown";
      const unit = state?.attributes?.unit_of_measurement || "";

      html += `<tr>
        <td class="entity-name">${this._escapeHtml(name)}</td>
        <td class="entity-state">${this._escapeHtml(value)}${unit ? " " + this._escapeHtml(unit) : ""}</td>
      </tr>`;
    });

    html += "</table>";
    return html;
  }

  _renderMarkdownCard(card) {
    return `<div class="markdown-content">${renderMarkdown(card.content || "")}</div>`;
  }

  async _initChart(card, index) {
    const container = this.shadowRoot.getElementById(`chart-container-${index}`);
    if (!container) return;

    const entities = card.entities || [];
    const timeRange = card.time_range || "24h";

    if (entities.length === 0) {
      container.innerHTML = '<div class="chart-loading">No entities to chart</div>';
      return;
    }

    // Fetch history data
    let historyData;
    try {
      const result = await sendWsCommand(this._hass, {
        type: "vibedash/history",
        entity_ids: entities,
        time_range: timeRange,
      });
      historyData = result.history;
    } catch (err) {
      console.error("Failed to fetch history:", err);
      container.innerHTML = `<div class="chart-loading">Failed to load history data</div>`;
      return;
    }

    // Try Chart.js
    const loaded = await ensureChartJs();
    if (loaded && window.Chart) {
      this._renderChartJs(container, card, historyData, index);
    } else {
      this._renderFallbackChart(container, card, historyData);
    }
  }

  _renderChartJs(container, card, historyData, index) {
    container.innerHTML = `<canvas id="canvas-${index}"></canvas>`;
    const canvas = this.shadowRoot.getElementById(`canvas-${index}`);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const chartType = card.chart_type === "bar" ? "bar" : "line";

    const datasets = (card.entities || []).map((entityId, i) => {
      const data = (historyData[entityId] || []).map((p) => ({
        x: new Date(p.t),
        y: p.y,
      }));

      const color = CHART_COLORS[i % CHART_COLORS.length];
      const state = this._hass?.states?.[entityId];
      const name = state?.attributes?.friendly_name || entityId;

      return {
        label: name,
        data: data,
        borderColor: color,
        backgroundColor: chartType === "bar" ? color + "88" : color + "22",
        fill: chartType === "line",
        tension: 0.3,
        pointRadius: data.length > 100 ? 0 : 2,
        borderWidth: 2,
      };
    });

    const textColor = getCssVar("--primary-text-color", "#e0e0e0");
    const gridColor = getCssVar("--divider-color", "#333") + "66";

    new window.Chart(ctx, {
      type: chartType,
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            labels: { color: textColor, boxWidth: 12, padding: 8, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleFont: { size: 12 },
            bodyFont: { size: 11 },
          },
        },
        scales: {
          x: {
            type: "time",
            ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 },
            grid: { color: gridColor },
          },
          y: {
            ticks: { color: textColor, font: { size: 10 } },
            grid: { color: gridColor },
          },
        },
      },
    });
  }

  _renderFallbackChart(container, card, historyData) {
    // Simple SVG sparkline fallback when Chart.js fails to load
    const entities = card.entities || [];
    const width = 360;
    const height = 180;
    const padding = 30;

    let svgContent = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:200px">`;

    entities.forEach((entityId, i) => {
      const data = historyData[entityId] || [];
      if (data.length < 2) return;

      const values = data.map((p) => p.y);
      const times = data.map((p) => new Date(p.t).getTime());
      const minY = Math.min(...values);
      const maxY = Math.max(...values);
      const minT = Math.min(...times);
      const maxT = Math.max(...times);
      const rangeY = maxY - minY || 1;
      const rangeT = maxT - minT || 1;

      const color = CHART_COLORS[i % CHART_COLORS.length];

      const points = data
        .map((p) => {
          const x = padding + ((new Date(p.t).getTime() - minT) / rangeT) * (width - 2 * padding);
          const y = height - padding - ((p.y - minY) / rangeY) * (height - 2 * padding);
          return `${x},${y}`;
        })
        .join(" ");

      svgContent += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>`;
    });

    svgContent += "</svg>";
    container.innerHTML = svgContent;
  }

  _updateCards() {
    // When hass updates, refresh metric/gauge/entity_list cards with latest state
    if (!this._dashboard || !this.shadowRoot) return;

    const { cards } = this._dashboard;
    (cards || []).forEach((card, i) => {
      const body = this.shadowRoot.getElementById(`card-body-${i}`);
      if (!body) return;

      if (card.type === "metric") {
        body.innerHTML = this._renderMetric(card);
      } else if (card.type === "gauge") {
        body.innerHTML = this._renderGauge(card, i);
      } else if (card.type === "entity_list") {
        body.innerHTML = this._renderEntityList(card);
      }
    });
  }

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

customElements.define("vibedash-panel", VibeDashPanel);
