// tests/helpers/constants.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Single source of truth for values shared by integration and e2e specs.
// These mirror _workspace/01_planner.md sections 3 and 7 — if the server
// changes a default or a limit, exactly one file here needs updating and the
// whole suite follows.

export const TEST_PORT = Number(Deno.env.get("TEST_PORT") ?? 3100);
export const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

/** Server-side defaults applied when a request field is absent (planner 7.1). */
export const SERVER_DEFAULTS = {
  width: 1280,
  height: 720,
  format: "png",
  quality: 90,
  fullPage: false,
  timeoutMs: 30_000,
} as const;

/** Validation bounds the API must enforce (planner 3.2 / 5 config.ts). */
export const LIMITS = {
  minWidth: 200,
  maxWidth: 5000,
  minHeight: 200,
  maxHeight: 20_000,
  minQuality: 1,
  maxQuality: 100,
  navigationTimeoutMs: 30_000,
  formats: ["png", "jpeg"],
} as const;

/** Error codes from planner 3.3. Kept as a const array so specs cannot typo one. */
export const ERROR_CODES = [
  "MISSING_URL",
  "INVALID_URL",
  "INVALID_DIMENSIONS",
  "INVALID_FORMAT",
  "INVALID_QUALITY",
  "INVALID_BODY",
  "BLOCKED_HOST",
  "NOT_FOUND",
  "NAVIGATION_FAILED",
  "BROWSER_UNAVAILABLE",
  "CAPTURE_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

/**
 * Default capture target for integration tests: the app's own page (planner
 * 8.1). It is always up while the suite runs, needs no external network, and
 * renders in milliseconds — so a screenshot assertion measures the screenshot
 * service rather than someone else's uptime.
 */
export const SAMPLE_URL = BASE_URL;

/**
 * The public URL from the product scenario (planner 8.2). Reserved for e2e,
 * which is allowed to touch the network; integration specs must not use it.
 */
export const EXTERNAL_SAMPLE_URL = "https://khusan.co.kr";

/**
 * A port on loopback with nothing listening. Chromium fails this with
 * net::ERR_CONNECTION_REFUSED immediately — a deterministic navigation
 * failure that needs no external network and never hangs.
 */
export const UNREACHABLE_URL = "http://127.0.0.1:9";

/** Stable testids owned by client-side-writer (planner 4.2); used by e2e specs. */
export const TESTIDS = {
  appShell: "app-shell",
  controlPanel: "control-panel",
  urlInput: "url-input",
  urlError: "url-error",
  autoCaptureToggle: "auto-capture-toggle",
  widthInput: "width-input",
  heightInput: "height-input",
  resetSizeBtn: "reset-size-btn",
  dimensionError: "dimension-error",
  formatSelect: "format-select",
  qualityRow: "quality-row",
  qualitySlider: "quality-slider",
  qualityValue: "quality-value",
  fullPageToggle: "fullpage-toggle",
  previewPane: "preview-pane",
  previewEmpty: "preview-empty",
  previewImage: "preview-image",
  previewMeta: "preview-meta",
  previewError: "preview-error",
  loadingSpinner: "loading-spinner",
  downloadBar: "download-bar",
  downloadBtn: "download-btn",
  downloadPngBtn: "download-png-btn",
  downloadJpegBtn: "download-jpeg-btn",
  statusBanner: "status-banner",
  statusText: "status-text",
  captureBtn: "capture-btn",
  langBtn: "lang-btn",
} as const;
