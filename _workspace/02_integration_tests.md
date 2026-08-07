<!--
  02_integration_tests.md — Integration test contract for the URL Screenshot API
  Author: integration-tester
  Date: 2026-07-26
-->

# 02 — Integration Tests

> **Scope**: API-level Playwright specs under `tests/integration/`. The `request` fixture only — no
> `page`, no browser, no UI. **Spec source**: `_workspace/01_planner.md` §3 (API contract) and §8.1
> (test plan). **Status**: 45 tests in 8 spec files. Written, linted, type-checked, and
> discoverable. **Not yet executable — `src/` does not exist.** Phase 2 owns that.

---

## 1. What these tests are for

They are the executable half of the API contract. `server-side-writer` should treat this suite as
the specification: if a spec here disagrees with an implementation choice, the spec is what the
client and the e2e suite were built against, so raise it rather than quietly diverging.

The suite is written to fail loudly on the mistakes that are _easy to make and hard to see_, not to
maximise assertion count. Three examples:

- The capture specs **decode the returned PNG/JPEG header** and compare real pixel dimensions. A
  server that echoes back the `width` it was handed while capturing at the wrong viewport passes a
  naive test and fails this one.
- The format specs check **magic bytes**, never `mimeType`. Relabelling a PNG as `image/jpeg` is
  invisible to a metadata-only assertion.
- The quality spec captures the same page twice at quality 15 and 95 and asserts the byte counts
  differ. Dropping the `quality` option on the floor still produces a perfectly valid JPEG, so this
  is the only assertion that catches it.

---

## 2. File inventory

### `tests/helpers/`

| File                | Role                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `constants.ts`      | `BASE_URL`, `TEST_PORT`, `SAMPLE_URL`, `SERVER_DEFAULTS`, `LIMITS`, `ERROR_CODES`, `UNREACHABLE_URL`, `TESTIDS`. Single source of truth — a changed default is a one-line edit here. |
| `fixtures.ts`       | `buildBody()`, `expectOk<T>()`, `expectApiError()`, `decodeDataUrl()`, `filenameFromDisposition()`, plus the `ScreenshotData` / `StatusData` interfaces.                             |
| `image.ts`          | Dependency-free PNG IHDR and JPEG SOF decoding: `detectFormat()`, `getImageSize()`, `isPng()`, `isJpeg()`. No image library, no trust in server metadata.                            |
| `fixture-server.ts` | Ephemeral local `Deno.serve` target with `/basic`, `/tall` (3000px), `/slow?ms=N`, `/status/:code`.                                                                                  |

`tests/helpers/server.ts` from the planner's tree was **not created** — the Playwright `webServer`
block owns the server lifecycle, so a second boot path would be dead code that drifts.

### `tests/integration/`

| Spec                             | Tests | Covers                                                                                                                                                                       |
| -------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.spec.ts`                 |     3 | 200 + envelope; responds without waiting on chromium; unmatched `/api/*` → JSON 404, not `index.html`                                                                        |
| `status.spec.ts`                 |     3 | `defaults` and `limits` match §3.2 exactly (`toEqual`, not `toMatchObject`); `status` ∈ ready/starting/degraded; always HTTP 200                                             |
| `screenshot.capture.spec.ts`     |     6 | Requested viewport → real decoded pixels; server defaults when fields omitted; bare-host → `https://` normalization; 1980×1080; `fullPage` false vs true                     |
| `screenshot.validation.spec.ts`  |     8 | `MISSING_URL`, `INVALID_URL`, `INVALID_DIMENSIONS`, `INVALID_FORMAT`, `INVALID_QUALITY`, `INVALID_BODY`; inclusive bounds; `details.field`; validation costs no browser time |
| `screenshot.format.spec.ts`      |     5 | Real JPEG bytes; `jpg` → `jpeg`; quality reaches the encoder; PNG reports `quality: null`; filename extension follows format                                                 |
| `screenshot.download.spec.ts`    |     7 | `GET /:id` metadata without `image`; byte-identical download; `Content-Disposition: attachment`; `Content-Length` === `bytes`; `?filename=` sanitization; 404 stays JSON     |
| `screenshot.errors.spec.ts`      |     5 | 502 `NAVIGATION_FAILED` (refused + DNS); a 404 page is still capturable; 504 `CAPTURE_TIMEOUT` honours `timeoutMs`; **server still healthy after 6 failed captures**         |
| `screenshot.concurrency.spec.ts` |     4 | Parallel captures at different sizes/formats do not bleed; a failure does not poison neighbours; every job independently retrievable                                         |

The last two files are beyond §8.1. They exist because the plan's A4 decision — one shared browser,
fresh `BrowserContext` per request — makes context leakage and cross-request bleed the two most
likely production failures, and neither is visible from a single-request test.

---

## 3. Key assumptions

1. **Capture target is `baseURL`** — the app's own page (planner §8.1). Always up, offline, fast.
   `ALLOW_PRIVATE_HOSTS` must therefore default to `true`, as the plan states; the whole suite 403s
   if it does not.
2. **Every error is the `{ ok, error: { code, message } }` envelope**, including on the binary
   download route and including express's own JSON parse errors. `expectApiError` enforces
   `ok === false`, a non-empty string `message`, and the absence of a `data` key on every single
   error assertion.
3. **Min/max bounds are inclusive.** `width: 200` must pass; `width: 199` must fail. Off-by-one
   bounds are the most common validator bug, so both sides are asserted.
4. **`fullPage: true` keeps `data.height` as the viewport height** while the image itself grows to
   the document height. Matches §3.3's note that the echoed values are the _effective viewport_.
5. **Job ids are 12 lowercase hex chars** (`/^[0-9a-f]{12}$/`) and
   `downloadUrl === /api/screenshot/{id}/download` exactly.
6. **`bytes` is the true payload length** and matches both the decoded data URL and the download's
   `Content-Length`. The client renders "471 KB" from it.
7. **The download serves the cached buffer, not a re-encode.** Asserted by comparing length and the
   leading 64 bytes against the previewed image.
8. **Only transport failures are errors.** An HTTP 404 target page is a valid thing to screenshot
   and must return 200.

---

## 4. Notes for `server-side-writer`

These are the points where a reasonable implementation could differ from what the suite asserts.
Worth reading before writing `validators.ts`.

| #   | Spec expects                                                                             | Why it might surprise you                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `format: ""` and `format: "PNG "` (trailing space) → **400 `INVALID_FORMAT`**            | A present-but-invalid field is rejected; only an _absent_ field falls back to the default. Do not trim-and-accept.                                                           |
| B2  | `url: "   "` (whitespace only) → **`MISSING_URL`**, not `INVALID_URL`                    | Trim first, then test for emptiness, then parse.                                                                                                                             |
| B3  | `quality` out of range → **400 `INVALID_QUALITY`** even though PNG ignores quality       | Validate the field on its own terms before deciding whether it is used. The PNG spec sends `quality: 40` and expects `200` with `quality: null` — so validate, then discard. |
| B4  | Malformed JSON → 400 envelope with **no stack trace or `node_modules` path** in the body | `express.json()` throws a `SyntaxError` that the default handler renders as HTML with a stack. It must be funnelled through `error.middleware.ts`.                           |
| B5  | `NAVIGATION_FAILED` message must **not start with `net::ERR_`**                          | It is rendered verbatim in `preview-error`. Map chromium constants to prose.                                                                                                 |
| B6  | `GET /api/screenshot/:id/download` 404 → `content-type: application/json`                | Easy to miss on a route that otherwise always writes binary.                                                                                                                 |
| B7  | `?filename=my report/../v2.png` → served name matches `/^[A-Za-z0-9._-]+$/`              | Sanitize to the character class in §3.5; no `/`, no `..`.                                                                                                                    |
| B8  | A 400 must return in **< 1s**                                                            | Validation runs before `getBrowser()`. If the router awaits the browser first, this fails even though the code is correct.                                                   |
| B9  | After 6 consecutive failed captures, `/api/status` still reports `"ready"`               | `context.close()` in a `finally`, and a navigation failure must not tear down the shared browser.                                                                            |
| B10 | `defaults` in `/api/status` has **exactly** 5 keys (no `timeoutMs`)                      | `status.spec.ts` uses `toEqual`. Adding a key fails the test — deliberately, since the client iterates this object.                                                          |

---

## 5. Blockers and open questions

**No blockers for Phase 2.** The suite is self-contained and the contract in §01_planner is
unambiguous everywhere the tests depend on it.

Two things needing a decision, both currently guarded so the suite passes either way:

- **B1 above (`format: ""`)** — the plan does not say whether an empty-string optional field is
  "absent" or "invalid". The suite chose _invalid_. Cheap to flip if server-side-writer prefers the
  other reading.
- **`example.com` in `screenshot.capture.spec.ts`** — the one test that touches the public internet,
  needed to prove bare-host normalization produces `https://example.com/`. It is written to accept
  either a successful capture or a `NAVIGATION_FAILED`/`CAPTURE_TIMEOUT`, and asserts only that the
  request was never rejected as `INVALID_URL`. So it is offline-safe, but it is the single spec
  whose _strongest_ assertion depends on network access.

**Current state**: `src/` does not exist yet, so `deno task test:integration` cannot run —
`webServer` has nothing to boot. Every one of the 45 tests is expected to fail until Phase 2 lands,
and that is the intended handoff signal.

---

## 6. Verification performed

```
deno lint                    → 13 files, 0 problems
deno fmt                     → applied
deno check tests/ playwright.config.ts
                             → 13 files, 0 type errors
playwright test --project=integration --list
                             → Total: 45 tests in 8 files
```

Run order once the server exists:

```
deno task setup              # one-time, installs chromium
deno task test:integration   # webServer boots build + start automatically
```
