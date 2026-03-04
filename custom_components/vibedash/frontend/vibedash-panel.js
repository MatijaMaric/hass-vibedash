/**
 * VibeDash - LLM-powered dashboard panel for Home Assistant
 *
 * Self-contained panel using a shadcn/ui-inspired design language
 * mapped onto Home Assistant's CSS variable theming system.
 */

// ============================================================
// Chart.js — loaded dynamically to avoid bundling ~200KB inline
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
      adapter.onload = () => { chartJsLoaded = true; resolve(true); };
      adapter.onerror = () => { chartJsLoaded = true; resolve(true); };
      document.head.appendChild(adapter);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return chartJsLoading;
}

// ============================================================
// WebSocket helper
// ============================================================

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
// Color palette for charts — uses HA accent tones
// ============================================================

const CHART_COLORS = [
  "#60a5fa", "#34d399", "#fbbf24", "#f87171",
  "#a78bfa", "#22d3ee", "#fb923c", "#f472b6",
  "#a3e635", "#818cf8",
];

// ============================================================
// HA theme color helpers
// ============================================================

function getCssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

// ============================================================
// SVG icons (inline, no external deps)
// ============================================================

const ICONS = {
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .963L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`,
  barChart: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  send: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.112z"/><path d="m21.854 2.147-10.94 10.939"/></svg>`,
  alertTriangle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

// Card type badge colors & labels
const CARD_TYPE_META = {
  chart:       { label: "Chart",       color: "#60a5fa" },
  metric:      { label: "Metric",      color: "#34d399" },
  gauge:       { label: "Gauge",       color: "#fbbf24" },
  entity_list: { label: "Entity List", color: "#a78bfa" },
  markdown:    { label: "Markdown",    color: "#94a3b8" },
};

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

  set narrow(value) { this._narrow = value; }
  set panel(value)  { this._panel = value; }
  set route(value)  { this._route = value; }

  connectedCallback() {
    this._render();
  }

  // ----------------------------------------------------------
  // Global styles (design tokens + component styles)
  // ----------------------------------------------------------

  _getStyles() {
    return `
      /* ── Design tokens ──────────────────────────────────── */
      :host {
        display: block;
        height: 100%;

        /* Surface */
        --vd-bg:          var(--primary-background-color, #0f172a);
        --vd-surface:     var(--card-background-color, #1e293b);
        --vd-surface-2:   color-mix(in srgb, var(--vd-surface) 92%, white 8%);

        /* Text */
        --vd-text:        var(--primary-text-color, #f1f5f9);
        --vd-text-muted:  var(--secondary-text-color, #94a3b8);
        --vd-text-faint:  var(--disabled-text-color, #64748b);

        /* Brand */
        --vd-primary:     var(--primary-color, #3b82f6);
        --vd-primary-fg:  var(--text-primary-color, #ffffff);
        --vd-accent:      var(--accent-color, #818cf8);

        /* Semantic */
        --vd-success:     var(--success-color, #22c55e);
        --vd-warning:     var(--warning-color, #f59e0b);
        --vd-error:       var(--error-color, #ef4444);

        /* Structure */
        --vd-border:      var(--divider-color, rgba(148,163,184,0.15));
        --vd-border-focus: var(--vd-primary);
        --vd-radius:      var(--ha-card-border-radius, 12px);
        --vd-radius-sm:   8px;
        --vd-radius-xs:   6px;
        --vd-shadow:      0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
        --vd-shadow-md:   0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.2);

        /* Typography */
        --vd-font:        var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);

        /* Transitions */
        --vd-transition:  150ms cubic-bezier(0.4, 0, 0.2, 1);
      }

      *, *::before, *::after { box-sizing: border-box; }

      /* ── Layout shell ───────────────────────────────────── */
      .shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--vd-bg);
        color: var(--vd-text);
        font-family: var(--vd-font);
        font-size: 14px;
        line-height: 1.5;
      }

      /* ── Top bar ────────────────────────────────────────── */
      .topbar {
        flex-shrink: 0;
        background: var(--vd-surface);
        border-bottom: 1px solid var(--vd-border);
        padding: 14px 20px 10px;
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .topbar-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
      }

      .brand-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--vd-radius-sm);
        background: var(--vd-primary);
        color: var(--vd-primary-fg);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .brand-name {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--vd-text);
      }

      .brand-name span {
        color: var(--vd-primary);
      }

      /* ── Prompt input ───────────────────────────────────── */
      .prompt-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--vd-bg);
        border: 1px solid var(--vd-border);
        border-radius: 999px;
        padding: 6px 6px 6px 18px;
        transition: border-color var(--vd-transition), box-shadow var(--vd-transition);
      }

      .prompt-wrap:focus-within {
        border-color: var(--vd-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--vd-primary) 20%, transparent);
      }

      .prompt-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--vd-text);
        font-family: var(--vd-font);
        font-size: 14px;
        min-width: 0;
      }

      .prompt-input::placeholder {
        color: var(--vd-text-faint);
      }

      .send-btn {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: var(--vd-primary);
        color: var(--vd-primary-fg);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity var(--vd-transition), transform var(--vd-transition);
      }

      .send-btn:hover:not(:disabled) {
        opacity: 0.88;
        transform: scale(1.05);
      }

      .send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      /* ── History chips ──────────────────────────────────── */
      .history-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 6px;
        min-height: 0;
      }

      .history-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: 1px solid var(--vd-border);
        border-radius: 999px;
        padding: 2px 10px 2px 7px;
        font-size: 12px;
        color: var(--vd-text-muted);
        cursor: pointer;
        transition: color var(--vd-transition), border-color var(--vd-transition), background var(--vd-transition);
        white-space: nowrap;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .history-chip:hover {
        border-color: var(--vd-primary);
        color: var(--vd-text);
        background: color-mix(in srgb, var(--vd-primary) 8%, transparent);
      }

      .history-chip svg { flex-shrink: 0; opacity: 0.6; }

      /* ── Main content area ──────────────────────────────── */
      .content {
        flex: 1;
        overflow-y: auto;
        padding: 24px 20px;
      }

      @media (max-width: 540px) {
        .topbar { padding: 12px 14px 10px; }
        .content { padding: 16px 14px; }
        .brand-name { display: none; }
      }

      /* ── Dashboard title ────────────────────────────────── */
      .dash-title {
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--vd-text);
        margin: 0 0 20px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dash-title::before {
        content: "";
        display: inline-block;
        width: 4px;
        height: 22px;
        border-radius: 2px;
        background: var(--vd-primary);
        flex-shrink: 0;
      }

      /* ── Card grid ──────────────────────────────────────── */
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 14px;
      }

      @media (max-width: 420px) {
        .card-grid { grid-template-columns: 1fr; }
      }

      /* ── Base card ──────────────────────────────────────── */
      .vd-card {
        background: var(--vd-surface);
        border: 1px solid var(--vd-border);
        border-radius: var(--vd-radius);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: border-color var(--vd-transition);
      }

      .vd-card:hover {
        border-color: color-mix(in srgb, var(--vd-border) 60%, var(--vd-primary) 40%);
      }

      .vd-card-header {
        padding: 14px 16px 10px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .vd-card-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--vd-text-muted);
        letter-spacing: 0.01em;
        line-height: 1.4;
      }

      .type-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid;
        line-height: 1.5;
        opacity: 0.85;
      }

      .vd-card-body {
        padding: 0 16px 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      /* ── Divider ─────────────────────────────────────────── */
      .card-divider {
        height: 1px;
        background: var(--vd-border);
        margin: 0;
      }

      /* ── Metric card ────────────────────────────────────── */
      .metric-wrap {
        padding-top: 4px;
      }

      .metric-value {
        font-size: 44px;
        font-weight: 300;
        letter-spacing: -0.03em;
        line-height: 1;
        color: var(--vd-text);
        display: flex;
        align-items: baseline;
        gap: 4px;
      }

      .metric-unit {
        font-size: 18px;
        font-weight: 400;
        color: var(--vd-text-muted);
        letter-spacing: 0;
      }

      .metric-name {
        font-size: 12px;
        color: var(--vd-text-faint);
        margin-top: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .metric-unavailable {
        font-size: 32px;
        font-weight: 300;
        color: var(--vd-text-faint);
      }

      /* ── Chart card ─────────────────────────────────────── */
      .chart-outer {
        position: relative;
        width: 100%;
        height: 210px;
      }

      .chart-outer canvas {
        width: 100% !important;
        height: 100% !important;
      }

      .chart-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 210px;
        gap: 8px;
        color: var(--vd-text-faint);
        font-size: 12px;
      }

      .chart-placeholder .spinner-sm {
        width: 20px;
        height: 20px;
        border: 2px solid var(--vd-border);
        border-top-color: var(--vd-primary);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      /* ── Gauge card ─────────────────────────────────────── */
      .gauge-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 0 4px;
        gap: 6px;
      }

      .gauge-svg {
        width: 170px;
        height: 100px;
        overflow: visible;
      }

      .gauge-value {
        font-size: 28px;
        font-weight: 300;
        letter-spacing: -0.02em;
        display: flex;
        align-items: baseline;
        gap: 3px;
        color: var(--vd-text);
      }

      .gauge-label {
        font-size: 12px;
        color: var(--vd-text-faint);
        text-align: center;
      }

      /* ── Entity list card ───────────────────────────────── */
      .entity-list {
        width: 100%;
        border-collapse: collapse;
      }

      .entity-list tr + tr td {
        border-top: 1px solid var(--vd-border);
      }

      .entity-list td {
        padding: 9px 0;
        font-size: 13px;
        vertical-align: middle;
      }

      .entity-list .ent-name {
        color: var(--vd-text);
        padding-right: 12px;
      }

      .entity-list .ent-state {
        text-align: right;
        white-space: nowrap;
      }

      .state-pill {
        display: inline-flex;
        align-items: center;
        background: color-mix(in srgb, var(--vd-primary) 12%, transparent);
        color: var(--vd-primary);
        border-radius: 999px;
        padding: 2px 9px;
        font-size: 12px;
        font-weight: 500;
      }

      /* ── Markdown card ──────────────────────────────────── */
      .markdown-body {
        font-size: 13px;
        line-height: 1.65;
        color: var(--vd-text);
      }

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3 {
        margin: 12px 0 4px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--vd-text);
      }

      .markdown-body h1 { font-size: 17px; }
      .markdown-body h2 { font-size: 15px; }
      .markdown-body h3 { font-size: 13px; }

      .markdown-body code {
        background: var(--vd-surface-2);
        border: 1px solid var(--vd-border);
        padding: 1px 5px;
        border-radius: var(--vd-radius-xs);
        font-size: 12px;
        font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      }

      .markdown-body ul {
        margin: 4px 0;
        padding-left: 18px;
      }

      .markdown-body li { margin: 2px 0; }

      /* ── Loading state ──────────────────────────────────── */
      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 20px;
        gap: 0;
      }

      .spinner-ring {
        width: 44px;
        height: 44px;
        border: 3px solid var(--vd-border);
        border-top-color: var(--vd-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 20px;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .loading-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--vd-text);
        margin-bottom: 6px;
      }

      .loading-sub {
        font-size: 12px;
        color: var(--vd-text-faint);
        text-align: center;
        max-width: 320px;
        line-height: 1.6;
      }

      .loading-steps {
        display: flex;
        gap: 8px;
        margin-top: 20px;
      }

      .loading-step {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--vd-text-faint);
        background: var(--vd-surface);
        border: 1px solid var(--vd-border);
        border-radius: 999px;
        padding: 4px 10px;
      }

      .step-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--vd-primary);
        animation: pulse 1.4s ease-in-out infinite;
      }

      .step-dot.delay { animation-delay: 0.7s; }

      @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.1); }
      }

      /* ── Skeleton shimmer ───────────────────────────────── */
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 14px;
        margin-top: 24px;
      }

      .skeleton-card {
        background: var(--vd-surface);
        border: 1px solid var(--vd-border);
        border-radius: var(--vd-radius);
        overflow: hidden;
        height: 160px;
        position: relative;
      }

      .skeleton-card::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--vd-text) 4%, transparent) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s ease-in-out infinite;
        background-size: 200% 100%;
      }

      @keyframes shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position:  200% 0; }
      }

      /* ── Empty state ────────────────────────────────────── */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 72px 20px 48px;
        text-align: center;
      }

      .empty-icon {
        color: var(--vd-text-faint);
        opacity: 0.5;
        margin-bottom: 20px;
      }

      .empty-title {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--vd-text);
        margin-bottom: 8px;
      }

      .empty-desc {
        font-size: 13px;
        color: var(--vd-text-muted);
        max-width: 380px;
        line-height: 1.6;
        margin-bottom: 28px;
      }

      /* ── Suggestion grid ────────────────────────────────── */
      .suggestions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        width: 100%;
        max-width: 480px;
      }

      @media (max-width: 420px) {
        .suggestions { grid-template-columns: 1fr; }
      }

      .suggestion-card {
        background: var(--vd-surface);
        border: 1px solid var(--vd-border);
        border-radius: var(--vd-radius-sm);
        padding: 11px 14px;
        font-size: 13px;
        color: var(--vd-text);
        cursor: pointer;
        text-align: left;
        transition: border-color var(--vd-transition), background var(--vd-transition), color var(--vd-transition);
        line-height: 1.4;
      }

      .suggestion-card:hover {
        border-color: var(--vd-primary);
        background: color-mix(in srgb, var(--vd-primary) 6%, var(--vd-surface));
        color: var(--vd-text);
      }

      .suggestion-card .sug-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vd-primary);
        margin-bottom: 3px;
      }

      /* ── Error banner ───────────────────────────────────── */
      .error-banner {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: color-mix(in srgb, var(--vd-error) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--vd-error) 40%, transparent);
        border-radius: var(--vd-radius-sm);
        padding: 12px 14px;
        margin-bottom: 16px;
        color: var(--vd-error);
        font-size: 13px;
        line-height: 1.5;
      }

      .error-banner .err-icon { flex-shrink: 0; margin-top: 1px; }

      .error-banner .err-msg { flex: 1; }

      .error-dismiss {
        flex-shrink: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        padding: 0;
        display: flex;
        align-items: center;
        transition: opacity var(--vd-transition);
      }

      .error-dismiss:hover { opacity: 1; }
    `;
  }

  // ----------------------------------------------------------
  // Initial render
  // ----------------------------------------------------------

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._getStyles()}</style>

      <div class="shell">
        <!-- Top bar -->
        <header class="topbar">
          <div class="topbar-row">
            <div class="brand">
              <div class="brand-icon">${ICONS.sparkles}</div>
              <span class="brand-name">Vibe<span>Dash</span></span>
            </div>
            <div class="prompt-wrap">
              <input
                id="promptInput"
                class="prompt-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="Describe the dashboard you want…"
              />
              <button class="send-btn" id="submitBtn" title="Generate dashboard">
                ${ICONS.send}
              </button>
            </div>
          </div>
          <div class="history-row" id="historyRow"></div>
        </header>

        <!-- Content -->
        <main class="content" id="content">
          ${this._emptyStateHtml()}
        </main>
      </div>
    `;

    this._setupEvents();
  }

  _emptyStateHtml() {
    const suggestions = [
      { label: "Climate", text: "Show temperature trends for the last 24 hours" },
      { label: "Energy",  text: "Energy usage overview this week" },
      { label: "Devices", text: "Battery levels for all devices" },
      { label: "Rooms",   text: "Climate overview by room" },
    ];

    return `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.barChart}</div>
        <div class="empty-title">What would you like to see?</div>
        <div class="empty-desc">
          Describe a dashboard in plain language and the AI will generate
          charts, metrics, and insights from your Home Assistant data.
        </div>
        <div class="suggestions" id="suggestions">
          ${suggestions.map((s) => `
            <button class="suggestion-card" data-prompt="${this._escapeAttr(s.text)}">
              <div class="sug-label">${this._escapeHtml(s.label)}</div>
              ${this._escapeHtml(s.text)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------
  // Event wiring
  // ----------------------------------------------------------

  _setupEvents() {
    const input = this.shadowRoot.getElementById("promptInput");
    const btn   = this.shadowRoot.getElementById("submitBtn");

    btn.addEventListener("click", () => this._submit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this._submit(); }
    });

    this.shadowRoot.addEventListener("click", (e) => {
      const sc = e.target.closest(".suggestion-card");
      if (sc) {
        input.value = sc.dataset.prompt || sc.textContent.trim();
        this._submit();
      }
    });
  }

  // ----------------------------------------------------------
  // Submit handler
  // ----------------------------------------------------------

  async _submit() {
    const input  = this.shadowRoot.getElementById("promptInput");
    const prompt = input.value.trim();
    if (!prompt || this._loading) return;

    this._loading   = true;
    this._error     = null;
    this._dashboard = null;
    this._renderLoading();
    this._addToHistory(prompt);

    try {
      const result = await sendWsCommand(this._hass, {
        type: "vibedash/generate",
        prompt,
      });
      this._dashboard = result.dashboard;
      this._renderDashboard();
    } catch (err) {
      console.error("VibeDash generation error:", err);
      this._error = err.message || "Failed to generate dashboard";
      this._renderError();
    } finally {
      this._loading = false;
      const btn = this.shadowRoot.getElementById("submitBtn");
      if (btn) btn.disabled = false;
    }
  }

  // ----------------------------------------------------------
  // History
  // ----------------------------------------------------------

  _addToHistory(prompt) {
    if (!this._history.includes(prompt)) {
      this._history.unshift(prompt);
      if (this._history.length > 5) this._history.pop();
    }
    this._renderHistoryChips();
  }

  _renderHistoryChips() {
    const row = this.shadowRoot.getElementById("historyRow");
    if (!row) return;
    row.innerHTML = this._history.map((p) => `
      <button class="history-chip" data-prompt="${this._escapeAttr(p)}" title="${this._escapeAttr(p)}">
        ${ICONS.clock}
        <span>${this._escapeHtml(p)}</span>
      </button>
    `).join("");

    row.querySelectorAll(".history-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.shadowRoot.getElementById("promptInput").value = chip.dataset.prompt || "";
        this._submit();
      });
    });
  }

  // ----------------------------------------------------------
  // Loading state
  // ----------------------------------------------------------

  _renderLoading() {
    const btn = this.shadowRoot.getElementById("submitBtn");
    if (btn) btn.disabled = true;

    const content = this.shadowRoot.getElementById("content");
    content.innerHTML = `
      <div class="loading-container">
        <div class="spinner-ring"></div>
        <div class="loading-title">Generating your dashboard…</div>
        <div class="loading-sub">
          Using two AI passes: first selecting the most relevant entities,
          then building the full dashboard layout.
        </div>
        <div class="loading-steps">
          <div class="loading-step"><div class="step-dot"></div> Entity selection</div>
          <div class="loading-step"><div class="step-dot delay"></div> Dashboard generation</div>
        </div>
      </div>
      <div class="skeleton-grid">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    `;
  }

  // ----------------------------------------------------------
  // Error state
  // ----------------------------------------------------------

  _renderError() {
    const content = this.shadowRoot.getElementById("content");
    content.innerHTML = `
      <div class="error-banner" id="errorBanner">
        <span class="err-icon">${ICONS.alertTriangle}</span>
        <span class="err-msg">${this._escapeHtml(this._error)}</span>
        <button class="error-dismiss" id="dismissError" title="Dismiss">${ICONS.x}</button>
      </div>
      ${this._emptyStateHtml()}
    `;
    this.shadowRoot.getElementById("dismissError")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("errorBanner")?.remove();
    });
  }

  // ----------------------------------------------------------
  // Dashboard render
  // ----------------------------------------------------------

  _renderDashboard() {
    const content = this.shadowRoot.getElementById("content");
    if (!this._dashboard) return;

    const { title, cards } = this._dashboard;

    let html = "";
    if (title) {
      html += `<h2 class="dash-title">${this._escapeHtml(title)}</h2>`;
    }

    html += '<div class="card-grid">';
    (cards || []).forEach((card, i) => {
      const meta = CARD_TYPE_META[card.type] || { label: card.type, color: "#94a3b8" };
      const badgeStyle = `color:${meta.color};border-color:${meta.color}40;background:${meta.color}12`;

      html += `
        <div class="vd-card" id="card-${i}">
          <div class="vd-card-header">
            <span class="vd-card-title">${this._escapeHtml(card.title || "")}</span>
            <span class="type-badge" style="${badgeStyle}">${meta.label}</span>
          </div>
          <div class="card-divider"></div>
          <div class="vd-card-body" id="card-body-${i}">
            ${this._renderCardBody(card, i)}
          </div>
        </div>
      `;
    });
    html += "</div>";

    content.innerHTML = html;

    // Post-render chart init
    (cards || []).forEach((card, i) => {
      if (card.type === "chart") this._initChart(card, i);
    });
  }

  // ----------------------------------------------------------
  // Card body renderers
  // ----------------------------------------------------------

  _renderCardBody(card, index) {
    switch (card.type) {
      case "metric":      return this._renderMetric(card);
      case "gauge":       return this._renderGauge(card, index);
      case "entity_list": return this._renderEntityList(card);
      case "markdown":    return this._renderMarkdownCard(card);
      case "chart":
        return `
          <div class="chart-outer" id="chart-container-${index}">
            <div class="chart-placeholder">
              <div class="spinner-sm"></div>
              Loading chart data…
            </div>
          </div>`;
      default:
        return `<div style="color:var(--vd-text-faint);font-size:13px">Unknown card type: ${card.type}</div>`;
    }
  }

  _renderMetric(card) {
    const state = this._hass?.states?.[card.entity];
    if (!state) {
      return `
        <div class="metric-wrap">
          <div class="metric-unavailable">—</div>
          <div class="metric-name">${this._escapeHtml(card.entity || "")}</div>
        </div>`;
    }
    const unit = state.attributes?.unit_of_measurement || "";
    const name = state.attributes?.friendly_name || card.entity;
    return `
      <div class="metric-wrap">
        <div class="metric-value">
          ${this._escapeHtml(state.state)}
          ${unit ? `<span class="metric-unit">${this._escapeHtml(unit)}</span>` : ""}
        </div>
        <div class="metric-name">${this._escapeHtml(name)}</div>
      </div>`;
  }

  _renderGauge(card, _index) {
    const state = this._hass?.states?.[card.entity];
    const value = state ? parseFloat(state.state) : 0;
    const min   = card.min ?? 0;
    const max   = card.max ?? 100;
    const pct   = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const unit  = state?.attributes?.unit_of_measurement || "";
    const name  = state?.attributes?.friendly_name || card.entity;

    // Semicircle arc (180° sweep, left to right)
    const r  = 60;
    const cx = 85;
    const cy = 80;

    function pt(angleDeg) {
      const a = (angleDeg * Math.PI) / 180;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }

    const startAngle = 180;
    const sweepAngle = 180;
    const currentAngle = startAngle + pct * sweepAngle;

    const bgS = pt(startAngle);
    const bgE = pt(startAngle + sweepAngle);
    const valE = pt(currentAngle);
    const largeArc = pct > 0.5 ? 1 : 0;

    let arcColor = "var(--vd-success)";
    if (pct > 0.8)      arcColor = "var(--vd-error)";
    else if (pct > 0.6) arcColor = "var(--vd-warning)";

    const bgPath  = `M ${bgS.x} ${bgS.y} A ${r} ${r} 0 1 1 ${bgE.x} ${bgE.y}`;
    const valPath = pct > 0.001
      ? `M ${bgS.x} ${bgS.y} A ${r} ${r} 0 ${largeArc} 1 ${valE.x} ${valE.y}`
      : "";

    return `
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 170 90">
          <path d="${bgPath}" fill="none" stroke="var(--vd-border)" stroke-width="9" stroke-linecap="round"/>
          ${valPath ? `<path d="${valPath}" fill="none" stroke="${arcColor}" stroke-width="9" stroke-linecap="round"/>` : ""}
        </svg>
        <div class="gauge-value">
          ${isNaN(value) ? "—" : this._escapeHtml(String(value))}
          ${unit ? `<span class="metric-unit">${this._escapeHtml(unit)}</span>` : ""}
        </div>
        <div class="gauge-label">${this._escapeHtml(name)}</div>
      </div>`;
  }

  _renderEntityList(card) {
    const entities = card.entities || [];
    const rows = entities.map((entityId) => {
      const state = this._hass?.states?.[entityId];
      const name  = state?.attributes?.friendly_name || entityId;
      const value = state?.state || "unknown";
      const unit  = state?.attributes?.unit_of_measurement || "";
      return `
        <tr>
          <td class="ent-name">${this._escapeHtml(name)}</td>
          <td class="ent-state">
            <span class="state-pill">${this._escapeHtml(value)}${unit ? " " + this._escapeHtml(unit) : ""}</span>
          </td>
        </tr>`;
    }).join("");
    return `<table class="entity-list">${rows}</table>`;
  }

  _renderMarkdownCard(card) {
    return `<div class="markdown-body">${renderMarkdown(card.content || "")}</div>`;
  }

  // ----------------------------------------------------------
  // Chart init
  // ----------------------------------------------------------

  async _initChart(card, index) {
    const container = this.shadowRoot.getElementById(`chart-container-${index}`);
    if (!container) return;

    const entities  = card.entities || [];
    const timeRange = card.time_range || "24h";

    if (!entities.length) {
      container.innerHTML = `<div class="chart-placeholder">No entities to chart</div>`;
      return;
    }

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
      container.innerHTML = `<div class="chart-placeholder">Failed to load history data</div>`;
      return;
    }

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

    const ctx       = canvas.getContext("2d");
    const chartType = card.chart_type === "bar" ? "bar" : "line";

    const datasets = (card.entities || []).map((entityId, i) => {
      const data  = (historyData[entityId] || []).map((p) => ({ x: new Date(p.t), y: p.y }));
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const name  = this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
      return {
        label: name,
        data,
        borderColor: color,
        backgroundColor: chartType === "bar" ? color + "88" : color + "18",
        fill: chartType === "line",
        tension: 0.35,
        pointRadius: data.length > 80 ? 0 : 2,
        borderWidth: 2,
      };
    });

    const textColor = getCssVar("--primary-text-color",   "#f1f5f9");
    const gridColor = getCssVar("--divider-color",        "rgba(148,163,184,0.12)");

    new window.Chart(ctx, {
      type: chartType,
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: datasets.length > 1,
            labels: { color: textColor, boxWidth: 10, padding: 10, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: "rgba(15,23,42,0.92)",
            titleFont: { size: 12 },
            bodyFont:  { size: 11 },
            padding: 10,
            cornerRadius: 8,
            borderColor: gridColor,
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            type: "time",
            ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 },
            grid:  { color: gridColor },
            border: { color: gridColor },
          },
          y: {
            ticks: { color: textColor, font: { size: 10 } },
            grid:  { color: gridColor },
            border: { color: gridColor },
          },
        },
      },
    });
  }

  _renderFallbackChart(container, card, historyData) {
    const entities = card.entities || [];
    const W = 360, H = 190, P = 28;
    let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:200px">`;

    entities.forEach((entityId, i) => {
      const data = historyData[entityId] || [];
      if (data.length < 2) return;
      const ys    = data.map((p) => p.y);
      const ts    = data.map((p) => new Date(p.t).getTime());
      const minY  = Math.min(...ys), maxY = Math.max(...ys);
      const minT  = Math.min(...ts), maxT = Math.max(...ts);
      const ranY  = maxY - minY || 1, ranT = maxT - minT || 1;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const pts   = data.map((p) => {
        const x = P + ((new Date(p.t).getTime() - minT) / ranT) * (W - 2 * P);
        const y = H - P - ((p.y - minY) / ranY) * (H - 2 * P);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    });

    svg += "</svg>";
    container.innerHTML = svg;
  }

  // ----------------------------------------------------------
  // Live hass state updates
  // ----------------------------------------------------------

  _updateCards() {
    if (!this._dashboard || !this.shadowRoot) return;
    (this._dashboard.cards || []).forEach((card, i) => {
      const body = this.shadowRoot.getElementById(`card-body-${i}`);
      if (!body) return;
      if      (card.type === "metric")      body.innerHTML = this._renderMetric(card);
      else if (card.type === "gauge")       body.innerHTML = this._renderGauge(card, i);
      else if (card.type === "entity_list") body.innerHTML = this._renderEntityList(card);
    });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  _escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str ?? "");
    return d.innerHTML;
  }

  _escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
}

customElements.define("vibedash-panel", VibeDashPanel);
