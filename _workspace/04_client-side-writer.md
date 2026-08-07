<!--
  04_client-side-writer.md — Client UI implementation notes
  Author: client-side-writer
  Date: 2026-07-26
-->

# 04 — Client-Side Writer

> **Scope**: `public/index.html`, `src/client/**`, `src/styles/tailwind.input.css`, and the shared
> `src/types/api.ts`. **Status**: implemented, linted, type-checked, built, and **behaviourally
> verified against a mock API** — 52/52 checks green, including the native download event and the
> `naturalWidth === 1980` assertion the e2e suite will make.

---

## 1. What was built

| File                                   | Role                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `public/index.html`                    | The only page. Static markup, Tailwind classes, no inline script.                |
| `src/client/main.ts`                   | Bootstrap: seed store from screen size, mount six components, expose `__APP__`.  |
| `src/client/store.ts`                  | `createStore()` — `getState` / `setState` / `subscribe`, ~40 lines.               |
| `src/client/api.ts`                    | `requestScreenshot()`, `fetchStatus()`, `ApiCallError`, envelope unwrapping.     |
| `src/client/dom.ts`                    | `$`, `$$`, `on`, `setText`, `setHidden`, `setDisabled`, `debounce`, `preloadImage`. |
| `src/client/actions.ts`                | **Added** — the capture side-effect, in one place. See §3.1.                     |
| `src/client/components/urlInput.ts`    | URL validation (400 ms), Enter-to-capture, auto-capture toggle (900 ms).         |
| `src/client/components/sizeControls.ts` | Screen defaults, localStorage, reset button, dimension errors, full-page toggle. |
| `src/client/components/formatSelector.ts` | PNG/JPEG select, quality slider shown only for JPEG.                           |
| `src/client/components/previewPane.ts` | Four exclusive states: empty / loading / image+meta / error.                     |
| `src/client/components/downloadBar.ts` | Native `<a download>` plus two re-capture buttons.                               |
| `src/client/components/statusBanner.ts` | One `/api/status` poll on load; owns `capture-btn` state.                        |
| `src/styles/tailwind.input.css`        | `@import "tailwindcss"` + four custom utilities + the `[hidden]` override.       |

Build artifacts `public/js/app.js` (17 KB, 11 modules) and `public/styles/tailwind.css` (16 KB) are
generated and now git-ignored (planner §9 sanctions this because `webServer.command` runs
`deno task build`).

---

## 2. Three decisions that are load-bearing

These are the places where an innocent-looking "cleanup" would break a passing test.

### 2.1 `[hidden] { display: none !important }` in the CSS

Components show and hide by toggling the `hidden` **attribute**, not a Tailwind class. The UA
stylesheet's `[hidden] { display: none }` is a plain display rule, so any Tailwind display utility on
the same element out-specifies it. `download-bar` is `flex` — without this override the download
buttons are visible before the first capture and the e2e default-state assertion fails. It is in the
stylesheet for a reason, not as a defensive habit.

### 2.2 The image is decoded *before* `status` becomes `"success"`

`actions.ts` awaits `preloadImage(data.image)` between the fetch resolving and the `setState`. The
e2e flow waits for `[data-testid=capture-btn][data-state=success]` and then reads
`preview-image.naturalWidth`. Setting `src` and flipping the status in the same tick makes that a
race: the attribute lands first and the decoder finishes microseconds later, so `naturalWidth` is
observably `0`. Awaiting the decode makes `data-state="success"` mean "the pixels are on screen",
which is what the wait is actually for.

### 2.3 `download-btn` is a real anchor, not a click handler

`<a download href="/api/screenshot/{id}/download">` on a same-origin URL is what makes chromium fire
a genuine download, which is what `page.waitForEvent("download")` observes and where
`suggestedFilename()` comes from. A JS blob-and-revoke download is invisible to that API. Planner A3
calls this out; it is restated here because it looks like dead weight next to the two
button-driven siblings.

---

## 3. Deviations from the plan

### 3.1 Components take a third argument: `mountX(root, store, actions)`

Planner §6 sketches `mountX(root, store)` and leaves the capture call unowned. Four things start a
capture — `capture-btn`, Enter in `url-input`, the auto-capture timer, and the two re-capture
download buttons. Inlining the fetch-and-transition sequence four times is exactly how a loading flag
and a store status drift apart, so it lives once in `src/client/actions.ts` and is passed in.
`formatSelector` and `sizeControls` never capture, so they keep the two-argument form.

`createActions(store)` returns `{ capture(options?) => Promise<boolean> }`. The boolean matters: the
download buttons await it and refuse to click a stale anchor when a re-capture failed.

### 3.2 `src/types/api.ts` was created here

Planner §A7 makes it shared but assigns no owner, and the client needed it immediately.
`server-side-writer` has since picked it up and extended it (added `INVALID_TIMEOUT`), which is the
intended direction — **the server owns it from here; the client only reads it.**

### 3.3 `capture-btn` is mounted by `statusBanner.ts`

As specified in planner §4.2's table, though it reads oddly. Its disabled rule spans two concerns
(URL validity and capture status) and the store is where those meet. `statusBanner` imports
`validateUrlShape` from `urlInput.ts` for the URL half.

### 3.4 Screen defaults are deliberately **not** clamped

`getScreenDefaults()` returns `window.screen.width/height` verbatim. Clamping to the server's
200–5000 range would satisfy the API but violate the hard requirement that the inputs *equal* the
screen size. A display outside the range surfaces as a visible `dimension-error` the user can fix,
rather than a number silently rewritten behind their back. `clampDimension()` is still exported per
the plan.

### 3.5 `deno.json` gained two imports

`@import "tailwindcss"` could not resolve: with `nodeModulesDir: "auto"` Deno left the package under
`node_modules/.deno/` and never hoisted it, so the CLI failed with
`Can't resolve 'tailwindcss' in '/src/styles'`. Adding `tailwindcss` and `@tailwindcss/cli` to
`imports` hoists both and `build:css` succeeds. Additive only — no task or existing import changed.

---

## 4. State flow

```
AppState { url, width, height, format, quality, fullPage, autoCapture, status, result, error }
```

Single flat object; every component subscribes and writes only the attributes it owns, so a "render"
is a handful of guarded attribute writes with no diffing. `setState` shallow-compares before
notifying — without that, a `setState` inside a subscriber recurses forever.

**Capture**

```
capture-btn click | Enter in url-input | auto-capture timer | download-{png,jpeg}-btn
  -> guard: already loading? -> bail
  -> guard: validateUrlShape(state.url) -> on failure, status="error" and stop (no request sent)
  -> status="loading"   (capture-btn disabled + data-state="loading", spinner visible)
  -> POST /api/screenshot { url, width, height, format, quality?, fullPage }
  -> await preloadImage(data.image)
  -> status="success"   (preview-image + meta, download-bar unhidden, data-state="success")
  or status="error"     (preview-error shows error.message, data-state="error")
```

`quality` is sent **only** when `format === "jpeg"`. The URL is sent as typed (trimmed) — the server
owns normalization and reports both `requestedUrl` and the resolved `url`.

**Timers.** Two independent debounces hang off one keystroke, and conflating them is the easy
mistake: **400 ms** validation (writes `state.url`, toggles `url-error` and the button) and
**900 ms** auto-capture (fires a real capture, only when the toggle is on). Validation has to be the
fast one so the button is clickable long before anything is spent on a browser.

**Size persistence.** `localStorage["urlshot:size"]` wins on reload; `reset-size-btn` always re-reads
the *live* screen and never the stored copy. Only a valid pair is persisted, so a half-typed `12` en
route to `1280` cannot overwrite a good remembered value.

---

## 5. Notes for `server-side-writer`

Nothing blocking. Three things the client assumes:

1. **`bytes` is the true payload length.** `preview-meta` renders `150 KB` straight from it without
   decoding anything.
2. **`error.message` is rendered verbatim** in `preview-error`. It is user-facing prose — this is
   the client-side reason behind integration-tester's B5 (`NAVIGATION_FAILED` must not surface a raw
   `net::ERR_*`).
3. **`downloadUrl` and `filename` are used as-is** on the anchor's `href` and `download`. The
   filename extension is what `suggestedFilename()` returns, so it has to follow the format.

The client never calls `GET /api/screenshot/:id` (metadata-only) — the capture response already
carries everything the preview needs. That route exists for the integration suite.

## 6. Notes for `qa-tester`

- Every testid in `tests/helpers/constants.ts` `TESTIDS` exists and is wired. None were renamed.
- **`[data-testid=capture-btn][data-state=...]` is the wait hook.** `idle` / `loading` / `success` /
  `error`. Prefer it over `toBeVisible()` on the preview.
- `window.__APP__.getState()` returns the live state — useful for asserting a *new* capture ran
  (compare `result.id`) when the transient `loading` state is too brief to observe.
- **Clear `localStorage` between tests** or the size defaults assertion will read a previous test's
  persisted value. A fresh Playwright context does this for free; `page.reload()` in the same context
  does not.
- `preview-meta` uses U+00D7 (`1980 × 1080`), spaces both sides, ` · ` separators.
- `auto-capture-toggle` is OFF by default. If a spec fills `url-input` and expects no capture, that
  holds — verified.

---

## 7. Verification performed

```
deno lint src/client src/types      -> 13 files, 0 problems
deno check src/client/main.ts       -> 0 type errors
deno fmt src/client                 -> applied
deno task build:css                 -> public/styles/tailwind.css, 16 KB
deno task build:client              -> public/js/app.js, 11 modules, 17 KB
```

Because `src/` had no server yet, the page was driven against a **throwaway mock API** (real PNG
encoder, so `naturalWidth` is meaningful) with Playwright: **52/52 checks passed.** Coverage included
screen-size defaults, URL validation both ways, format/quality visibility, dimension errors,
localStorage persistence and reload, `reset-size-btn` beating storage, the full capture flow at
1980×1080, `naturalWidth`/`naturalHeight`, a native download event with `.png`, a JPEG re-capture
downloading `.jpeg`, the error state rendering a server message, Enter-to-capture, auto-capture
firing on idle, and auto-capture staying quiet when off. The only console error in the whole run was
the deliberately provoked 502.

**This is not a substitute for the real e2e suite** — it proves the client against the *contract*,
not against the real server. The first run of `deno task test:e2e` is still the real signal.

---

## 8. Changeable assumptions

1. **Auto-capture default OFF.** Flip in `main.ts` `initialState()` if a live preview is wanted —
   note it means a chromium navigation per typing pause.
2. **Client URL validation requires a plausible hostname** (a dot, `localhost`, or an IPv4). Without
   it, typing a single `e` yields `https://e`, which the URL parser accepts, and the button flickers
   enabled on the first keystroke of every session. This only gates the button; the server
   re-validates.
3. **Invalid sizes block persistence but not the capture button.** Planner §4.2 ties `capture-btn`
   only to URL validity and loading state, so an out-of-range size reaches the server and returns a
   400 that renders in `preview-error`. Say the word and I will add dimension validity to the
   disabled rule.
4. **`quality` is omitted for PNG** rather than sent and ignored. Harmless either way.
5. **Status is polled once on load**, no retry. A server that is still `starting` shows `Starting…`
   until a reload. A slow poll would be easy to add; it was left out to avoid a timer leaking across
   test runs.
6. **Screen defaults are unclamped** (§3.4).
