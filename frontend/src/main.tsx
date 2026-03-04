import { createRoot, type Root } from "react-dom/client";
import { HassProvider, type HassObject } from "./contexts/HassContext";
import { App } from "./App";
import "./index.css";

declare const __VIBEDASH_CSS__: string;

class VibeDashPanel extends HTMLElement {
  private _root: Root | null = null;
  private _hass: HassObject | null = null;
  private _mountPoint: HTMLDivElement | null = null;
  private _styleEl: HTMLStyleElement | null = null;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    // Inject CSS into shadow DOM
    this._styleEl = document.createElement("style");
    this._styleEl.textContent =
      typeof __VIBEDASH_CSS__ !== "undefined" ? __VIBEDASH_CSS__ : "";
    shadow.appendChild(this._styleEl);

    // Mount point for React
    this._mountPoint = document.createElement("div");
    this._mountPoint.id = "vibedash-root";
    this._mountPoint.style.height = "100%";
    shadow.appendChild(this._mountPoint);

    this._root = createRoot(this._mountPoint);
    this._renderReact();
  }

  disconnectedCallback() {
    this._root?.unmount();
    this._root = null;
  }

  set hass(value: HassObject) {
    this._hass = value;
    this._renderReact();
  }

  set panel(_value: unknown) {
    // HA sets panel config; not needed for VibeDash
  }

  set narrow(_value: boolean) {
    // HA signals narrow layout; handled via CSS
  }

  set route(_value: unknown) {
    // HA routing; single-page panel, not used
  }

  private _renderReact() {
    if (!this._root || !this._hass) return;
    this._root.render(
      <HassProvider hass={this._hass}>
        <App />
      </HassProvider>,
    );
  }
}

customElements.define("vibedash-panel", VibeDashPanel);
