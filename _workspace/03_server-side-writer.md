<!--
  03_server-side-writer.md — Express server implementation notes
  Author: server-side-writer
  Date: 2026-07-26
-->

# 03 — Server-Side Writer: Express Implementation

> **Status**: **45 / 45 integration tests passing.** Verified via the real
> `deno task test:integration` path (cold boot, `deno task build && deno task start`).
> `deno lint` 44 files / 0 problems. `deno check src/main.ts` clean.

---

## 1. What was built

Sixteen files, all ESModules TypeScript, all carrying a signature header comment.

| Layer          | File                                     | Responsibility                                                       |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| **entry**      | `src/main.ts`                            | `listen()` + SIGINT/SIGTERM graceful shutdown                        |
|                | `src/app.ts`                             | `createApp()` factory — no `listen`, no side effects                 |
|                | `src/config.ts`                          | `DEFAULTS`, `LIMITS`, `JOB`, `getPort()`, `allowPrivateHosts()`      |
| **routes**     | `src/routes/index.ts`                    | `mountRoutes(app)`                                                   |
|                | `src/routes/health.route.ts`             | `GET /api/health`                                                    |
|                | `src/routes/status.route.ts`             | `GET /api/status`                                                    |
|                | `src/routes/screenshot.route.ts`         | `POST /`, `GET /:id`, `GET /:id/download`                            |
| **services**   | `src/services/browser.service.ts`        | one shared chromium, memoized launch                                 |
|                | `src/services/screenshot.service.ts`     | `capture(opts)` — fresh context per request                          |
|                | `src/services/job.store.ts`              | LRU + TTL buffer cache                                               |
| **middleware** | `src/middleware/validate.middleware.ts`  | body → `NormalizedRequest`                                           |
|                | `src/middleware/error.middleware.ts`     | the single error funnel (registered LAST)                            |
|                | `src/middleware/notFound.middleware.ts`  | unmatched `/api/*` → JSON 404                                        |
| **lib**        | `src/lib/errors.ts`                      | `AppError`, `ERROR_CODES`, `httpStatusFor()`, `toEnvelope()`         |
|                | `src/lib/validators.ts`                  | `normalizeUrl()`, `validateDimension()`, `parseScreenshotRequest()`… |
|                | `src/lib/filename.ts`                    | `buildFilename()`, `sanitizeFilename()`                              |
|                | `src/lib/logger.ts`                      | JSON-lines `log.info/warn/error`                                     |
|                | _(removed)_ `src/lib/async.ts`           | deleted on upgrade to express 5 — rejected async handlers are caught   |
|                |                                            | natively and passed to `next(err)` by the router                     |
| **types**      | `src/types/server.ts`                    | server-only types (`NormalizedRequest`, `CaptureResult`, …)          |

Middleware order in `createApp()` is the contract:

```
express.json({limit:"1mb"}) → API routes → express.static(public) → /api 404 → error handler
```

API routes are mounted **before** `express.static` so an unknown `/api` path can never be
answered with `index.html`. The error handler is **last** so `express.json()`'s own
`SyntaxError` is funnelled through it instead of rendering body-parser's default HTML page
with a stack trace.

---

## 2. Deviations from the plan

Three, all small. Nothing else diverges from `01_planner.md` §3.

### D1 — `src/types/api.ts` is owned by client-side-writer; server types live in `src/types/server.ts`

The planner assigned the shared contract to `src/types/api.ts`. client-side-writer created it
first, and their version matches the contract, so I **did not overwrite it**. Server-only types
that must never reach the browser bundle (raw untrusted bodies, `CaptureResult` with its
`Uint8Array`, `JobRecord`, `BrowserInfo`) went into a sibling `src/types/server.ts` instead.

The only edit I made to the shared file is additive: one new entry in `ERROR_CODES`. See D2.

### D2 — Added error code `INVALID_TIMEOUT` (400)

`screenshot.errors.spec.ts:96` requires an out-of-range `timeoutMs` to be a 400, but the
planner's §3.3 error table has no code for it. The spec asserts only the status and `ok:false`,
never the code, so any code would have passed. I added a dedicated `INVALID_TIMEOUT` rather
than overloading `INVALID_BODY` (which means "body is not a JSON object") or `INVALID_DIMENSIONS`
(which means width/height). It carries `details.field = "timeoutMs"` like every other field error.

**client-side-writer**: this widens the `ErrorCode` union by one member. If you switch
exhaustively on error codes, add a case; if you fall back to `error.message`, nothing changes.

### D3 — Navigation strategy is `waitUntil: "load"` then a capped best-effort `networkidle`

The planner's §5 sketch was `waitUntil: "networkidle"` falling back to `"load"` on timeout.
I inverted it: `goto` uses `"load"` with the caller's full `timeoutMs` budget, then a separate
`waitForLoadState("networkidle")` capped at 2 s (and at whatever budget remains) whose rejection
is swallowed.

Reason: the planner's version cannot honour `timeoutMs` correctly. A page that never goes idle
(analytics beacon, long-poll, open websocket) would burn the entire budget in `goto` and then
retry, doubling the wall-clock time and turning a capturable page into a 504. The inverted order
gives the same "let late fonts settle" behaviour without ever letting a chatty page block a
capture.

---

## 3. Where the tests pinned behaviour that is easy to get wrong

These are the decisions the suite forced, recorded so a later refactor does not quietly undo one.

| Behaviour                                                                | Why                                                                                                                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Absent vs present-but-invalid**                                        | Every validator tests `=== undefined`, never truthiness. `{width: 0}` and `{format: ""}` are 400s, not omissions (B1).                                    |
| **`format` matching is exact** — no trim, no case fold                   | `"PNG "` must fail. Once `"PNG"` is accepted there is no principled place left to stop, so the match is strict against `png`/`jpeg`/`jpg`.                 |
| **`quality` is validated, then discarded**                               | Out-of-range quality is a 400 *even for PNG*; a valid quality becomes `null` for PNG. Two separate steps (B3).                                             |
| **`url` trimmed before the empty check**                                 | `"   "` is `MISSING_URL`, not `INVALID_URL` (B2).                                                                                                         |
| **`defaults` in `/api/status` has exactly 5 keys**                       | `status.spec.ts` uses `toEqual`. `config.ts` exports a separate `PUBLIC_DEFAULTS` so `timeoutMs` cannot leak in by accident (B10).                         |
| **`context.close()` in a `finally`**                                     | Six failed navigations must leave `/api/status` reporting `"ready"`. A navigation failure never tears down the shared browser — only a launch failure does. |
| **Chromium constants mapped to prose**                                   | `net::ERR_CONNECTION_REFUSED` → "The site refused the connection." The message is rendered verbatim in `preview-error` (B5).                              |
| **Download serves the stored buffer**                                    | Never a re-encode. The suite compares length and the leading 64 bytes against the previewed data URL.                                                      |
| **Errors stay JSON on the binary route**                                 | A 404 from `/:id/download` is `application/json` (B6).                                                                                                    |
| **Validation precedes `getBrowser()`**                                   | It is its own middleware, so the ordering is structural rather than a convention someone can break. A 400 returns in ~6 ms (B8).                           |

**Filename sanitization** (B7) needed two passes, not one. Filtering to `[A-Za-z0-9._-]` leaves
dots intact — they are needed for extensions — so `..` survives the character filter. Collapsing
runs of dots is a separate step: `my report/../v2.png` → `my-report-.-v2.png`.

**A non-obvious one in `normalizeUrl`**: bare-host detection cannot simply look for a `scheme:`
prefix, because `localhost:3000` matches that shape and would parse with protocol `localhost:`,
then be rejected as `INVALID_URL`. A colon followed only by digits is treated as a port, not a
scheme.

---

## 4. Verification

```
deno task setup              # installed chromium build v1234 (see note below)
deno lint                    → 44 files, 0 problems
deno check src/main.ts       → 0 type errors
deno task test:integration   → 45 passed (24.0s)
```

The full run boots through `webServer: "deno task build && deno task start"`, so the reported
pass covers the tailwind build, the client bundle, and a cold server with no browser launched yet.

Shutdown verified: no orphaned `chrome-headless-shell` process after the run.

> **Environment note**: this machine had playwright chromium builds up to v1228 cached, but
> `playwright@1.62.0` requires **v1234**. Every capture returned `503 BROWSER_UNAVAILABLE` until
> `deno task setup` was run. If a teammate sees a wall of 503s, that is the cause — it is an
> environment gap, not a code one.

### Formatting

`deno fmt --check` reports 3 files still unformatted, all belonging to client-side-writer and all
under active edit at the time of writing:

- `public/index.html`
- `src/client/components/sizeControls.ts`
- `src/styles/tailwind.input.css`

I deliberately did **not** run `deno fmt` across them — reformatting a file another agent has open
invites a lost edit. All 19 server files pass `deno fmt --check`. **client-side-writer: please run
`deno fmt` before you report done.**

---

## 5. Notes for client-side-writer

The API behaves exactly as `01_planner.md` §3 describes. Four things worth knowing:

1. **`ErrorCode` gained `INVALID_TIMEOUT`** (D2 above).
2. **`GET /api/screenshot/:id` omits `image` entirely** — the key is absent, not `null`. Use
   `"image" in data` or a truthiness check, not `data.image === null`.
3. **`quality` is `null` for every PNG response**, even when a value was sent. Do not echo the
   slider value back into the store from the response for PNG captures.
4. **`downloadUrl` is a root-relative path** (`/api/screenshot/{id}/download`), safe to drop
   straight into `<a href download>`. Same origin, so the native download event fires.

`GET /api/status` is stable and cheap — it never launches the browser, so polling it on load
costs nothing.

---

## 6. Changeable assumptions

Flag any of these and I will revise:

1. **`INVALID_TIMEOUT` as a new code** rather than folding `timeoutMs` errors into an existing
   one. Reversible in one file if you would rather keep the union at the planner's 12 members.
2. **`format` matching is case-sensitive.** `"PNG"` (no trailing space) is rejected. The suite only
   pins `"PNG "`, so accepting uppercase is available if the client ever sends it — it does not
   today.
3. **A malformed job id returns 404, not 400.** The id space is opaque to callers, so
   distinguishing "wrong shape" from "unknown" only advertises the format. The spec accepts either.
4. **Timeout budget applies to navigation only**, not to the encode step. A 20 000 px tall
   `fullPage` PNG can exceed `timeoutMs` in encoding without erroring. No test covers it; say the
   word if you want the budget to span the whole capture.
5. **JPEG files get a `.jpg` extension**, not `.jpeg`. Both satisfy the suite's `/\.jpe?g$/`.
6. **`ALLOW_PRIVATE_HOSTS` defaults to true.** Required — the whole suite screenshots `127.0.0.1`.
   Set it to `false` for any public deployment to enable the SSRF guard in `normalizeUrl()`.
