<!--
  01_planner.md — URL Screenshot Project Architecture Plan
  Author: planner
  Date: 2026-07-26
-->

# 01 — Planner: URL Screenshot Project Architecture

> **Stack**: Deno 2.6.7 (runtime) · Express 4 (`npm:express`) · plain HTML + Tailwind CSS v4 ·
> Playwright 1.62.0 (`npm:playwright`) **Goal**: A web page where a user types a URL, sets
> width/height (defaulting to their screen size), and downloads the rendered screenshot as PNG or
> JPEG.

---

## 1. Architecture Overview

### 1.1 Client / Server separation

```
┌──────────────────────────── BROWSER (client) ────────────────────────────┐
│  public/index.html  ← static shell, Tailwind classes only                │
│  public/js/app.js   ← bundled from src/client/*.ts (Deno bundle)         │
│                                                                          │
│  State: { url, width, height, format, quality, fullPage, status, result }│
│  Components: UrlInput · SizeControls · FormatSelector · PreviewPane ·    │
│              DownloadBar · StatusBanner                                  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ fetch() JSON over HTTP
                                 │ POST /api/screenshot   (capture)
                                 │ GET  /api/screenshot/:id/download (binary)
                                 │ GET  /api/status       (readiness)
┌────────────────────────────────▼─────────────────────────────────────────┐
│                       DENO PROCESS (server)                              │
│  src/main.ts        → boot + graceful shutdown                           │
│  src/app.ts         → createApp() returns express app (NO listen)        │
│    ├ middleware: json body, static(public), validate, error handler      │
│    └ routes: /api/health · /api/status · /api/screenshot                 │
│  src/services/                                                           │
│    ├ browser.service.ts   → ONE long-lived chromium instance             │
│    ├ screenshot.service.ts→ new context per request, capture, dispose    │
│    └ job.store.ts         → in-memory LRU+TTL cache of captured buffers  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ Playwright CDP
                        ┌────────▼────────┐
                        │ Chromium headless│ → navigates to target URL
                        └──────────────────┘
```

### 1.2 Key architectural decisions

| #  | Decision                                                                                       | Rationale                                                                                                                                                                                   |
| -- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 | **`createApp()` factory exported from `src/app.ts`, `listen()` only in `src/main.ts`**         | Integration tests can import the app or boot it on an ephemeral port without side effects.                                                                                                  |
| A2 | **Synchronous capture** — `POST /api/screenshot` returns the image inline as a base64 data URL | One round-trip → preview renders instantly, no polling machinery. Capture is 1–5 s, well inside HTTP timeouts.                                                                              |
| A3 | **Buffer also cached server-side under a job `id`**                                            | `GET /api/screenshot/:id/download` gives a real binary download with `Content-Disposition`, so the browser's native download flow (and Playwright's `page.waitForEvent('download')`) works. |
| A4 | **Single shared browser, fresh `BrowserContext` per request**                                  | Launching chromium costs ~700 ms; contexts cost ~20 ms and give full cookie/storage isolation.                                                                                              |
| A5 | **Client TS is bundled ahead of time** to `public/js/app.js`                                   | Browsers cannot run `.ts`. `deno bundle --platform=browser` keeps the toolchain 100 % Deno — no node build step.                                                                            |
| A6 | **Tailwind v4 compiled to `public/styles/tailwind.css` via `@tailwindcss/cli`**                | No CDN dependency → tests run offline and deterministically.                                                                                                                                |
| A7 | **Shared types live in `src/types/api.ts`, imported by BOTH server and client**                | The API contract cannot drift between the two writers.                                                                                                                                      |

---

## 2. File Structure

```
resize/
├── deno.json                          # tasks, imports, lint/fmt config  (NO comments allowed)
├── deno.lock
├── playwright.config.ts               # projects: integration | e2e
├── CLAUDE.md
│
├── src/
│   ├── main.ts                        # entry point: createApp() → listen() → shutdown hooks
│   ├── app.ts                         # createApp(): express.Express  ← server-side-writer
│   ├── config.ts                      # DEFAULTS, LIMITS, env parsing
│   │
│   ├── routes/
│   │   ├── index.ts                   # mountRoutes(app)
│   │   ├── health.route.ts            # GET  /api/health
│   │   ├── status.route.ts            # GET  /api/status
│   │   └── screenshot.route.ts        # POST /api/screenshot
│   │                                  # GET  /api/screenshot/:id
│   │                                  # GET  /api/screenshot/:id/download
│   │
│   ├── services/
│   │   ├── browser.service.ts         # getBrowser / closeBrowser / isBrowserReady
│   │   ├── screenshot.service.ts      # capture(options) → CaptureResult
│   │   └── job.store.ts               # put / get / prune  (Map + TTL + LRU)
│   │
│   ├── middleware/
│   │   ├── validate.middleware.ts     # body → normalized ScreenshotRequest
│   │   ├── error.middleware.ts        # AppError | unknown → JSON envelope
│   │   └── notFound.middleware.ts     # unmatched /api/* → 404 envelope
│   │
│   ├── lib/
│   │   ├── errors.ts                  # AppError, ERROR_CODES, httpStatusFor()
│   │   ├── validators.ts              # normalizeUrl / validateDimensions / validateFormat / validateQuality
│   │   ├── filename.ts                # buildFilename()
│   │   └── logger.ts                  # log.info / log.warn / log.error (JSON lines)
│   │
│   ├── types/
│   │   └── api.ts                     # ScreenshotRequest, ScreenshotData, ApiEnvelope, StatusData, ErrorCode
│   │
│   ├── client/                        # ← client-side-writer
│   │   ├── main.ts                    # bootstrap: wire components to store, initial defaults
│   │   ├── store.ts                   # createStore(): tiny observable state container
│   │   ├── api.ts                     # requestScreenshot(), fetchStatus()
│   │   ├── dom.ts                     # $, $$, on(), setText(), toggle() helpers
│   │   └── components/
│   │       ├── urlInput.ts
│   │       ├── sizeControls.ts
│   │       ├── formatSelector.ts
│   │       ├── previewPane.ts
│   │       ├── downloadBar.ts
│   │       └── statusBanner.ts
│   │
│   └── styles/
│       └── tailwind.input.css         # @import "tailwindcss"; + 2–3 @utility rules
│
├── public/                            # served by express.static()
│   ├── index.html                     # ← client-side-writer (the ONLY page)
│   ├── js/app.js                      # GENERATED — do not hand-edit
│   └── styles/tailwind.css            # GENERATED — do not hand-edit
│
├── tests/
│   ├── helpers/
│   │   ├── constants.ts               # BASE_URL, TEST_PORT, SAMPLE_URL, TESTIDS
│   │   ├── server.ts                  # startTestServer() / stopTestServer()  (only if not using webServer)
│   │   └── fixtures.ts                # buildBody(), expectEnvelope(), decodeDataUrl()
│   ├── integration/                   # ← integration-tester  (API-level, no browser UI)
│   │   ├── health.spec.ts
│   │   ├── status.spec.ts
│   │   ├── screenshot.capture.spec.ts
│   │   ├── screenshot.validation.spec.ts
│   │   ├── screenshot.format.spec.ts
│   │   └── screenshot.download.spec.ts
│   └── e2e/                           # ← qa-tester  (real browser UI)
│       ├── defaults.spec.ts
│       ├── screenshot-flow.spec.ts
│       └── download.spec.ts
│
└── _workspace/
    ├── 01_planner.md                  ← this file
    ├── 02_integration_tests.md
    ├── 03_server-side-writer.md
    ├── 04_client-side-writer.md
    └── 05_qa_tester.md
```

### 2.1 `deno.json` (shape server-side-writer should produce)

```jsonc
{
  "nodeModulesDir": "auto",
  "imports": {
    "express": "npm:express@^4.21.2",
    "@types/express": "npm:@types/express@^4.17.21",
    "playwright": "npm:playwright@1.62.0",
    "@playwright/test": "npm:@playwright/test@1.62.0"
  },
  "tasks": {
    "setup": "deno run -A npm:playwright@1.62.0 install chromium",
    "build:css": "deno run -A npm:@tailwindcss/cli@^4 -i src/styles/tailwind.input.css -o public/styles/tailwind.css --minify",
    "build:client": "deno bundle --platform=browser --output public/js/app.js src/client/main.ts",
    "build": "deno task build:css && deno task build:client",
    "start": "deno run --allow-net --allow-read --allow-env --allow-run --allow-write --allow-sys src/main.ts",
    "dev": "deno task build && deno run --watch --allow-net --allow-read --allow-env --allow-run --allow-write --allow-sys src/main.ts",
    "test": "deno run -A npm:@playwright/test@1.62.0 test",
    "test:integration": "deno run -A npm:@playwright/test@1.62.0 test --project=integration",
    "test:e2e": "deno run -A npm:@playwright/test@1.62.0 test --project=e2e",
    "lint": "deno lint",
    "fmt": "deno fmt"
  },
  "lint": { "rules": { "tags": ["recommended"] } },
  "fmt": { "lineWidth": 100, "semiColons": true, "singleQuote": false }
}
```

> `deno.json` / `deno.lock` take **no signature comments** (JSON). Every `.ts`, `.html`, `.css` file
> gets a header comment: `// <agent-name> — YYYY-MM-DD`.

### 2.2 `playwright.config.ts` (contract for both test authors)

```ts
// planner — 2026-07-26
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(Deno.env.get("TEST_PORT") ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // one shared browser server-side; keep capture load sane
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "integration", testDir: "./tests/integration" },
    { name: "e2e", testDir: "./tests/e2e", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "deno task build && deno task start",
    url: `${BASE_URL}/api/health`,
    env: { PORT: String(PORT), NODE_ENV: "test" },
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 120_000,
  },
});
```

**Integration tests use the `request` fixture only** (no page/browser) — they hit the API directly.
**E2E tests drive `page`** through the real UI.

---

## 3. API Contract

All JSON responses use one envelope. **No endpoint ever returns a bare object.**

```ts
type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
```

### 3.1 `GET /api/health`

Liveness only — must respond even while chromium is still booting.

- **200** → `{ "ok": true, "data": { "status": "ok", "uptimeMs": 12345 } }`

### 3.2 `GET /api/status`

Readiness + the exact defaults/limits the client should honor.

- **200** →

```json
{
  "ok": true,
  "data": {
    "status": "ready",
    "browser": { "connected": true, "name": "chromium", "version": "1.62.0" },
    "jobs": { "cached": 3, "capacity": 50 },
    "uptimeMs": 84210,
    "defaults": { "width": 1280, "height": 720, "format": "png", "quality": 90, "fullPage": false },
    "limits": {
      "minWidth": 200,
      "maxWidth": 5000,
      "minHeight": 200,
      "maxHeight": 20000,
      "minQuality": 1,
      "maxQuality": 100,
      "navigationTimeoutMs": 30000,
      "formats": ["png", "jpeg"]
    }
  }
}
```

- `status` is `"ready" | "starting" | "degraded"`. `"degraded"` when the last browser launch failed.
  HTTP code stays **200** in all three cases (the body carries the state).

### 3.3 `POST /api/screenshot` ← the core endpoint

**Request** `Content-Type: application/json`

| field       | type              | required | default | notes                                                                                         |
| ----------- | ----------------- | -------- | ------- | --------------------------------------------------------------------------------------------- |
| `url`       | string            | ✅       | —       | `http:`/`https:` only. A bare `example.com` is auto-prefixed with `https://`.                 |
| `width`     | number            | ❌       | `1280`  | integer, 200 – 5000                                                                           |
| `height`    | number            | ❌       | `720`   | integer, 200 – 20000                                                                          |
| `format`    | `"png" \| "jpeg"` | ❌       | `"png"` | `"jpg"` accepted as an alias, normalized to `"jpeg"`                                          |
| `quality`   | number            | ❌       | `90`    | 1 – 100. **JPEG only**; silently ignored for PNG.                                             |
| `fullPage`  | boolean           | ❌       | `false` | when `true`, `height` still sets the viewport but the capture extends to full document height |
| `timeoutMs` | number            | ❌       | `30000` | 1000 – 60000                                                                                  |

**200 response**

```json
{
  "ok": true,
  "data": {
    "id": "b1f4c2a0e9d7",
    "url": "https://khusan.co.kr/",
    "requestedUrl": "khusan.co.kr",
    "width": 1980,
    "height": 1080,
    "format": "png",
    "fullPage": false,
    "quality": null,
    "mimeType": "image/png",
    "bytes": 482913,
    "image": "data:image/png;base64,iVBORw0KGgo...",
    "downloadUrl": "/api/screenshot/b1f4c2a0e9d7/download",
    "filename": "screenshot-khusan-co-kr-1980x1080-20260726T023700.png",
    "capturedAt": "2026-07-26T02:37:00.123Z",
    "durationMs": 2415
  }
}
```

> `width`/`height` in the response are the **effective** values actually applied to the viewport.
> Tests assert against these, and (for `fullPage: false`) against the real pixel dimensions of the
> decoded PNG.

**Error responses**

| HTTP | `error.code`          | Trigger                                                                    |
| ---- | --------------------- | -------------------------------------------------------------------------- |
| 400  | `MISSING_URL`         | `url` absent, empty, or not a string                                       |
| 400  | `INVALID_URL`         | unparseable, or protocol not `http`/`https` (e.g. `ftp://`, `javascript:`) |
| 400  | `INVALID_DIMENSIONS`  | non-integer / NaN / out of the min-max range                               |
| 400  | `INVALID_FORMAT`      | not `png` / `jpeg` / `jpg`                                                 |
| 400  | `INVALID_QUALITY`     | not an integer in 1–100                                                    |
| 400  | `INVALID_BODY`        | body is not a JSON object                                                  |
| 403  | `BLOCKED_HOST`        | private/loopback host **while** `ALLOW_PRIVATE_HOSTS=false`                |
| 404  | `NOT_FOUND`           | unknown job id, or unmatched `/api/*` route                                |
| 502  | `NAVIGATION_FAILED`   | DNS failure, connection refused, non-recoverable nav error                 |
| 503  | `BROWSER_UNAVAILABLE` | chromium could not be launched                                             |
| 504  | `CAPTURE_TIMEOUT`     | navigation or capture exceeded `timeoutMs`                                 |
| 500  | `INTERNAL_ERROR`      | anything unclassified                                                      |

Example:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_DIMENSIONS",
    "message": "width must be an integer between 200 and 5000",
    "details": { "field": "width", "received": 10 }
  }
}
```

### 3.4 `GET /api/screenshot/:id`

Metadata only — same `data` shape as 3.3 **minus** the `image` field. `404 NOT_FOUND` when
unknown/expired.

### 3.5 `GET /api/screenshot/:id/download`

Binary. Headers:

```
Content-Type: image/png            (or image/jpeg)
Content-Disposition: attachment; filename="screenshot-khusan-co-kr-1980x1080-20260726T023700.png"
Content-Length: 482913
Cache-Control: private, max-age=900
```

Optional `?filename=custom.png` overrides the name (sanitized: `[^A-Za-z0-9._-]` → `-`).
`404 NOT_FOUND` when the job expired.

### 3.6 Static routes

| Route                      | Serves                                     |
| -------------------------- | ------------------------------------------ |
| `GET /`                    | `public/index.html`                        |
| `GET /styles/tailwind.css` | generated CSS, `text/css`                  |
| `GET /js/app.js`           | generated bundle, `application/javascript` |

---

## 4. UI Component Breakdown

One page, one column, `max-w-6xl mx-auto`. **Every interactive element carries a stable
`data-testid`** — this list is the contract for integration-tester and qa-tester.

### 4.1 Layout

```
┌─ [app-shell] ──────────────────────────────────────────────┐
│  header: "URL Screenshot"          [status-banner]         │
│  ┌─ [control-panel] ────────────────────────────────────┐  │
│  │ [url-input ..........................] [capture-btn] │  │
│  │ [url-error]                                          │  │
│  │ W [width-input]  H [height-input]  [reset-size-btn]  │  │
│  │ [dimension-error]                                    │  │
│  │ Format [format-select ▾]  Quality [quality-slider]   │  │
│  │ [fullpage-toggle] Full page                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ [preview-pane] ─────────────────────────────────────┐  │
│  │  [preview-empty] | [loading-spinner] | [preview-image]│ │
│  │  [preview-meta]  1980 × 1080 · PNG · 471 KB · 2.4 s  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ [download-bar] ─────────────────────────────────────┐  │
│  │  [download-btn]  [download-png-btn] [download-jpeg-btn]│ │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Component contracts

#### `UrlInput` — `src/client/components/urlInput.ts`

| testid                | element                   | behavior                                                                                                                                                                       |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `url-input`           | `<input type="url">`      | **Real-time**: on every keystroke, debounce **400 ms** → `validateUrlShape()` → sets/clears `url-error`, enables/disables `capture-btn`. `Enter` triggers capture immediately. |
| `url-error`           | `<p role="alert">`        | hidden (`hidden` attribute) when valid; text `"Enter a valid http(s) URL"` when not                                                                                            |
| `auto-capture-toggle` | `<input type="checkbox">` | **default OFF**. When ON, a valid URL that has been idle 900 ms auto-fires a capture. Prevents hammering while typing.                                                         |

Exports: `mountUrlInput(root, store)`,
`validateUrlShape(raw): { valid: boolean; normalized?: string; reason?: string }`

#### `SizeControls` — `src/client/components/sizeControls.ts`

| testid            | element                                   | behavior                                |
| ----------------- | ----------------------------------------- | --------------------------------------- |
| `width-input`     | `<input type="number" min=200 max=5000>`  | initial value = `window.screen.width`   |
| `height-input`    | `<input type="number" min=200 max=20000>` | initial value = `window.screen.height`  |
| `reset-size-btn`  | `<button>`                                | restores both inputs to the screen size |
| `dimension-error` | `<p role="alert">`                        | shown when a value is outside the range |
| `fullpage-toggle` | `<input type="checkbox">`                 | default unchecked                       |

Exports: `mountSizeControls(root, store)`, `getScreenDefaults(): { width: number; height: number }`,
`clampDimension(value, min, max)`

> **Default rule (hard requirement)**: on first load the width/height inputs MUST equal
> `window.screen.width` / `window.screen.height`. If `window.screen` is unavailable, fall back to
> `window.innerWidth/innerHeight`, then to `1280 × 720`. Values are persisted to `localStorage`
> under `urlshot:size` and restored on reload — **but** `reset-size-btn` always returns to live
> screen size.

#### `FormatSelector` — `src/client/components/formatSelector.ts`

| testid           | element                                                                 | behavior                         |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `format-select`  | `<select>` with `<option value="png">PNG` / `<option value="jpeg">JPEG` | default `png`                    |
| `quality-row`    | `<div>`                                                                 | `hidden` unless format is `jpeg` |
| `quality-slider` | `<input type="range" min=1 max=100>`                                    | default `90`                     |
| `quality-value`  | `<span>`                                                                | mirrors the slider, e.g. `"90"`  |

#### `PreviewPane` — `src/client/components/previewPane.ts`

| testid            | element               | state                                                                                           |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `preview-pane`    | `<section>`           | always present                                                                                  |
| `preview-empty`   | `<div>`               | visible only when `status === "idle"` — text `"Preview will appear here"`                       |
| `loading-spinner` | `<div role="status">` | visible only when `status === "loading"`                                                        |
| `preview-image`   | `<img>`               | `src` = `data.image`; present only when `status === "success"`; `alt` = `"Screenshot of {url}"` |
| `preview-meta`    | `<p>`                 | `"{width} × {height} · {FORMAT} · {kb} KB · {sec}s"`                                            |
| `preview-error`   | `<div role="alert">`  | visible only when `status === "error"`; renders `error.message`                                 |

The image is displayed with `max-w-full h-auto` so a 1980-wide capture scales down; the natural size
stays intact for assertions (`naturalWidth`).

#### `DownloadBar` — `src/client/components/downloadBar.ts`

| testid              | element        | behavior                                                                                                         |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `download-bar`      | `<div>`        | `hidden` until a successful capture                                                                              |
| `download-btn`      | `<a download>` | `href` = `data.downloadUrl`, `download` = `data.filename` — downloads the current capture in its captured format |
| `download-png-btn`  | `<button>`     | re-captures with `format: "png"` if the current result is not PNG, then downloads                                |
| `download-jpeg-btn` | `<button>`     | re-captures with `format: "jpeg"` (quality from the slider), then downloads                                      |

> Native `<a download>` on a same-origin URL is what makes Playwright's
> `page.waitForEvent("download")` fire — this is deliberate.

#### `StatusBanner` — `src/client/components/statusBanner.ts`

| testid          | element               | behavior                                                                                                                                                                                                                 |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status-banner` | `<div role="status">` | polls `GET /api/status` once on load; shows `Ready` / `Starting…` / `Degraded`                                                                                                                                           |
| `status-text`   | `<span>`              | the human label                                                                                                                                                                                                          |
| `capture-btn`   | `<button>`            | label `"Capture"`; `disabled` while `status === "loading"` or the URL is invalid; `data-state` attribute mirrors the store status (`idle` / `loading` / `success` / `error`) — the single most useful hook for E2E waits |

---

## 5. Server Functions to Implement

### `src/config.ts`

```ts
export const DEFAULTS = {
  width: 1280,
  height: 720,
  format: "png",
  quality: 90,
  fullPage: false,
  timeoutMs: 30_000,
} as const;
export const LIMITS = {
  minWidth: 200,
  maxWidth: 5000,
  minHeight: 200,
  maxHeight: 20_000,
  minQuality: 1,
  maxQuality: 100,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  formats: ["png", "jpeg"],
} as const;
export const JOB = { capacity: 50, ttlMs: 15 * 60_000 } as const;
export function getPort(): number; // env PORT ?? 3000
export function allowPrivateHosts(): boolean; // env ALLOW_PRIVATE_HOSTS !== "false"  (default TRUE)
```

### `src/lib/validators.ts`

```ts
normalizeUrl(raw: unknown): string                 // throws AppError(MISSING_URL | INVALID_URL | BLOCKED_HOST)
validateDimension(v: unknown, field: "width"|"height", fallback: number): number
validateFormat(v: unknown): "png" | "jpeg"         // "jpg" → "jpeg"
validateQuality(v: unknown, format: string): number | null   // null for png
validateTimeout(v: unknown): number
validateBoolean(v: unknown, fallback: boolean): boolean
parseScreenshotRequest(body: unknown): NormalizedRequest      // orchestrates all of the above
```

### `src/lib/errors.ts`

```ts
export const ERROR_CODES = { MISSING_URL, INVALID_URL, INVALID_DIMENSIONS, INVALID_FORMAT,
  INVALID_QUALITY, INVALID_BODY, BLOCKED_HOST, NOT_FOUND, NAVIGATION_FAILED,
  BROWSER_UNAVAILABLE, CAPTURE_TIMEOUT, INTERNAL_ERROR } as const;
export class AppError extends Error {
  constructor(code: ErrorCode, message: string, details?: unknown);
}
export function httpStatusFor(code: ErrorCode): number;
export function toEnvelope(err: unknown): { ok: false; error: {...} };
```

### `src/services/browser.service.ts`

```ts
getBrowser(): Promise<Browser>       // lazy launch, memoized promise; retries once on failure
isBrowserReady(): boolean
getBrowserInfo(): { connected: boolean; name: string; version: string | null }
closeBrowser(): Promise<void>        // called from SIGINT/SIGTERM handlers in main.ts
```

Launch args:
`chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })`.

### `src/services/screenshot.service.ts`

```ts
capture(opts: NormalizedRequest): Promise<CaptureResult>
// 1. const browser = await getBrowser()
// 2. context = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:1 })
// 3. page.setDefaultNavigationTimeout(opts.timeoutMs)
// 4. await page.goto(url, { waitUntil: "networkidle" })  ← fall back to "load" on timeout
// 5. await page.waitForTimeout(250)   // let late fonts/animations settle
// 6. buffer = await page.screenshot({ type, quality?, fullPage })
// 7. finally → await context.close()   (ALWAYS, even on throw)
// Maps playwright TimeoutError → CAPTURE_TIMEOUT, net::ERR_* → NAVIGATION_FAILED
```

`CaptureResult = { buffer: Uint8Array; width: number; height: number; durationMs: number }`

### `src/services/job.store.ts`

```ts
putJob(record: JobRecord): string     // returns 12-char hex id
getJob(id: string): JobRecord | null  // null when expired; touches LRU
pruneJobs(): void                     // TTL sweep, evict oldest past capacity
jobStats(): { cached: number; capacity: number }
```

### `src/routes/screenshot.route.ts`

```ts
createScreenshotRouter(): Router
// POST   "/"              → validate → capture → putJob → 200 envelope with data URL
// GET    "/:id"           → metadata envelope (no image field)
// GET    "/:id/download"  → binary + Content-Disposition
```

### `src/lib/filename.ts`

```ts
buildFilename(url: string, w: number, h: number, format: string, at: Date): string
// → "screenshot-khusan-co-kr-1980x1080-20260726T023700.png"
sanitizeFilename(name: string): string
```

### `src/app.ts`

```ts
export function createApp(): express.Express;
// express.json({ limit: "1mb" })
// express.static("public", { extensions: ["html"] })
// mountRoutes(app)      → /api/health, /api/status, /api/screenshot
// notFoundMiddleware    → /api/* only
// errorMiddleware       → LAST
```

### `src/main.ts`

```ts
const app = createApp();
const server = app.listen(getPort(), () => log.info("listening", { port }));
// Deno.addSignalListener("SIGINT" | "SIGTERM", async () => { await closeBrowser(); server.close(); Deno.exit(0) })
```

---

## 6. Client Functions to Implement

### `src/client/store.ts`

```ts
type AppState = {
  url: string; width: number; height: number;
  format: "png" | "jpeg"; quality: number; fullPage: boolean; autoCapture: boolean;
  status: "idle" | "loading" | "success" | "error";
  result: ScreenshotData | null;
  error: { code: string; message: string } | null;
};
createStore(initial: AppState): { getState(); setState(patch); subscribe(fn): () => void }
```

### `src/client/api.ts`

```ts
requestScreenshot(payload): Promise<ScreenshotData>   // throws { code, message } on !ok
fetchStatus(): Promise<StatusData>
```

### `src/client/main.ts`

```ts
// 1. read screen defaults → seed store
// 2. mount all six components against document
// 3. subscribe render loop
// 4. expose window.__APP__ = { getState } in non-production for test introspection
```

### Interaction flows

**Capture flow**

1. `capture-btn` click (or `Enter` in `url-input`, or auto-capture debounce)
2. `status → "loading"`, `capture-btn[disabled]`, spinner visible, `data-state="loading"`
3. `POST /api/screenshot` with the full normalized payload
4. success → `status → "success"`, `preview-image[src]` set, `preview-meta` filled, `download-bar`
   unhidden, `data-state="success"`
5. failure → `status → "error"`, `preview-error` shows `error.message`, `data-state="error"`

**Download flow**

1. `download-btn` is an `<a download href="/api/screenshot/{id}/download">` → native browser
   download
2. `download-jpeg-btn` when the current result is PNG → re-POST with `format: "jpeg"` → then
   programmatically click the refreshed anchor

---

## 7. Defaults, Limits, Error Strategy (quick reference)

### 7.1 Defaults

| Value        | Client default         | Server default (when the field is absent) |
| ------------ | ---------------------- | ----------------------------------------- |
| width        | `window.screen.width`  | `1280`                                    |
| height       | `window.screen.height` | `720`                                     |
| format       | `png`                  | `png`                                     |
| quality      | `90` (JPEG only)       | `90`                                      |
| fullPage     | `false`                | `false`                                   |
| timeoutMs    | not sent               | `30000`                                   |
| auto-capture | OFF                    | n/a                                       |

### 7.2 Error handling strategy

| Layer                 | Strategy                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client input**      | Validate on the fly; disable `capture-btn` rather than letting a bad request through. Inline `role="alert"` messages next to the offending field.                                                           |
| **Server validation** | Fail fast in `validate.middleware.ts` **before** touching the browser → cheap 400s. Every error names the field in `details`.                                                                               |
| **Capture**           | `try/finally` guarantees `context.close()`. Playwright `TimeoutError` → `504 CAPTURE_TIMEOUT`; `net::ERR_*` → `502 NAVIGATION_FAILED`.                                                                      |
| **Browser lifecycle** | Launch is memoized; a failed launch clears the memo so the next request retries. Persistent failure → `503 BROWSER_UNAVAILABLE` and `/api/status` reports `"degraded"`.                                     |
| **Process**           | `error.middleware.ts` is the single funnel — no route ever writes an error body itself. Unknown throwables become `500 INTERNAL_ERROR` with a generic message (stack only to the log, never to the client). |
| **Shutdown**          | SIGINT/SIGTERM → close browser → close server → exit 0. Prevents orphaned chromium processes across test runs.                                                                                              |

---

## 8. Test Plan Handoff

### 8.1 For **integration-tester** → `tests/integration/`

Use the Playwright `request` fixture against `baseURL`. Suggested core coverage (skip trivia):

| Spec file                       | Must assert                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `health.spec.ts`                | `GET /api/health` → 200, `ok === true`                                                                                                                                                                                                                             |
| `status.spec.ts`                | `GET /api/status` → 200; `data.defaults` and `data.limits` match §3.2 exactly; `data.status` ∈ ready/starting/degraded                                                                                                                                             |
| `screenshot.capture.spec.ts`    | `POST` with `{url: baseURL, width: 800, height: 600}` → 200; `data.image` starts with `data:image/png;base64,`; `data.width === 800`; `data.height === 600`; decoded PNG IHDR really is 800×600; `data.id` and `data.downloadUrl` present                          |
| `screenshot.validation.spec.ts` | missing url → 400 `MISSING_URL`; `"ftp://x"` → 400 `INVALID_URL`; `width: 10` → 400 `INVALID_DIMENSIONS`; `format: "gif"` → 400 `INVALID_FORMAT`; `quality: 500` → 400 `INVALID_QUALITY`. Every body matches the `{ ok:false, error:{ code, message } }` envelope. |
| `screenshot.format.spec.ts`     | `format: "jpeg"` → `mimeType === "image/jpeg"`, data URL prefix `data:image/jpeg;base64,`, `quality` echoed; `format: "jpg"` normalizes to `"jpeg"`; PNG response has `quality === null`                                                                           |
| `screenshot.download.spec.ts`   | `GET /api/screenshot/{id}/download` → 200, `content-type: image/png`, `content-disposition` contains `attachment; filename=`; body length === `data.bytes`; unknown id → 404 `NOT_FOUND`                                                                           |

**Target URL for integration tests**: use `baseURL` itself (the app's own page). It is always up,
needs no network, and is fast.

### 8.2 For **qa-tester** → `tests/e2e/`

| Spec file                 | Scenario                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults.spec.ts`        | On load, `width-input` value === `window.screen.width` and `height-input` value === `window.screen.height`; `format-select` === `png`; `preview-empty` visible; `download-bar` hidden                                                                                                                                                                   |
| `screenshot-flow.spec.ts` | **The required scenario**: fill `url-input` = `https://khusan.co.kr`, set `width-input` = `1980`, `height-input` = `1080`, click `capture-btn`, wait for `[data-testid=capture-btn][data-state=success]`, assert `preview-image` visible, `preview-image` `naturalWidth === 1980` / `naturalHeight === 1080`, and `preview-meta` contains `1980 × 1080` |
| `download.spec.ts`        | After a successful capture, `page.waitForEvent("download")` around a `download-btn` click; `suggestedFilename()` ends with `.png`; then switch `format-select` to `jpeg`, re-capture, download again, filename ends with `.jpeg`                                                                                                                        |

---

## 9. Build & Run Order (for the Phase-2 writers)

```
deno task setup        # one-time: installs chromium for playwright
deno task build        # tailwind.css + app.js  ← MUST run before any test
deno task start        # http://localhost:3000
deno task test:integration
deno task test:e2e
deno lint && deno fmt  # required before reporting done
```

`public/js/app.js` and `public/styles/tailwind.css` are build artifacts — add them to `.gitignore`
**only if** the writers keep `deno task build` in the Playwright `webServer.command` (which this
plan does).

---

## 10. Assumptions (changeable — tell me and I will revise)

1. **Synchronous capture, no job queue.** `POST /api/screenshot` blocks until the image is ready. If
   you want a `202 + GET /api/status/:jobId` polling model, say so — it changes §3.3 and adds
   `tests/integration/status.poll.spec.ts`.
2. **"Real-time URL input" = live validation + optional debounced auto-capture (default OFF).**
   Auto-capturing on every keystroke would fire a browser launch per character. Flip the default to
   ON if you actually want a live preview.
3. **`window.screen.width/height` as the default size**, not `innerWidth/innerHeight`. Under
   headless Playwright these are the emulated screen dimensions (1280×720 for `Desktop Chrome`) — so
   the E2E defaults test compares against `window.screen.*` at runtime rather than hard-coding
   numbers.
4. **Private/loopback hosts are allowed by default** (`ALLOW_PRIVATE_HOSTS` defaults to `true`)
   because integration tests screenshot `127.0.0.1`. Set it to `false` for a public deployment to
   get the SSRF guard.
5. **Tailwind v4 compiled via `@tailwindcss/cli`**, not the Play CDN — keeps tests offline and
   deterministic. Switch to the CDN `<script>` if you want zero build steps.
6. **Client TS bundled with `deno bundle --platform=browser`.** If that proves unstable on this Deno
   version, the fallback is `esbuild` via `npm:esbuild` in the same task — the file layout does not
   change.
7. **Test port 3100** (app default 3000) so a dev server and a test run can coexist.
8. **JPEG quality default 90**, `deviceScaleFactor` fixed at 1 (no retina/@2x option). Add
   `scale: 1|2` to the request if you want it.
