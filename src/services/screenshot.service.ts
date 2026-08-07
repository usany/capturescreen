// src/services/screenshot.service.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// The capture itself. Three things here are load-bearing and each is asserted
// by a specific test:
//
//   1. A FRESH BrowserContext per request. Reusing a page or mutating a shared
//      viewport makes parallel captures at different sizes bleed into each
//      other (screenshot.concurrency.spec.ts).
//   2. `context.close()` in a `finally`. Six failed navigations must leave the
//      server healthy (screenshot.errors.spec.ts, B9).
//   3. Chromium error constants mapped to prose. `net::ERR_CONNECTION_REFUSED`
//      is rendered verbatim in the UI's error pane, so it never reaches the
//      wire (B5).

import { SETTLE } from "../config.ts";
import { AppError, ERROR_CODES, isAppError } from "../lib/errors.ts";
import { errorFields, log } from "../lib/logger.ts";
import { getBrowser } from "./browser.service.ts";
import type { CaptureResult, NormalizedRequest } from "../types/server.ts";

/** Readable equivalents for the chromium network errors users actually hit. */
const NAVIGATION_MESSAGES: Array<[RegExp, string]> = [
  [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/, "That domain could not be found."],
  [/ERR_CONNECTION_REFUSED/, "The site refused the connection."],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/, "The site took too long to respond."],
  [/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/, "The connection to the site was reset."],
  [/ERR_SSL|ERR_CERT/, "The site has an invalid HTTPS certificate."],
  [/ERR_ADDRESS_UNREACHABLE|ERR_NETWORK/, "The site could not be reached."],
  [/ERR_ABORTED/, "The page stopped loading before it could be captured."],
  [/ERR_TOO_MANY_REDIRECTS/, "The site redirected too many times."],
];

function isTimeout(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "TimeoutError") return true;
  return typeof e.message === "string" &&
    /Timeout \d+ms exceeded|exceeded.*timeout/i.test(e.message);
}

function messageFor(raw: string): string | null {
  for (const [pattern, message] of NAVIGATION_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  return /net::ERR_/.test(raw) ? "The page could not be loaded." : null;
}

/**
 * Classify a Playwright failure.
 *
 * A timeout is 504 and a transport failure is 502. Note what is NOT an error:
 * an HTTP 4xx/5xx response. `page.goto` resolves for those, and a 404 page is
 * a perfectly legitimate thing to screenshot.
 */
function toCaptureError(err: unknown, url: string): AppError {
  if (isAppError(err)) return err;

  const raw = err instanceof Error ? err.message : String(err);

  if (isTimeout(err)) {
    return new AppError(
      ERROR_CODES.CAPTURE_TIMEOUT,
      "The page took too long to load and the capture timed out.",
      { url },
    );
  }

  const friendly = messageFor(raw);
  if (friendly) {
    return new AppError(ERROR_CODES.NAVIGATION_FAILED, friendly, { url });
  }

  log.error("capture.unclassified", { url, ...errorFields(err) });
  return new AppError(ERROR_CODES.INTERNAL_ERROR, "The screenshot could not be captured.");
}

/**
 * Capture one screenshot.
 *
 * `waitUntil: "load"` carries the caller's full timeout budget; the
 * networkidle wait afterwards is best-effort and capped, so a page with a
 * long-polling connection still gets captured instead of timing out.
 */
export async function capture(opts: NormalizedRequest): Promise<CaptureResult> {
  const started = Date.now();
  const browser = await getBrowser();

  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
    // Screenshots of pages that block on a permission prompt would hang.
    ignoreHTTPSErrors: true,
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeoutMs);
    page.setDefaultNavigationTimeout(opts.timeoutMs);

    await page.goto(opts.url, { waitUntil: "load", timeout: opts.timeoutMs });

    const remaining = opts.timeoutMs - (Date.now() - started);
    if (remaining > 0) {
      await page
        .waitForLoadState("networkidle", { timeout: Math.min(SETTLE.networkIdleMs, remaining) })
        .catch(() => {
          // Best effort only: a page that never goes idle is still capturable.
        });
    }

    // Lets late webfonts and entry animations settle before the shutter.
    await page.waitForTimeout(SETTLE.postLoadMs);

    const buffer = await page.screenshot({
      type: opts.format,
      fullPage: opts.fullPage,
      // Playwright rejects `quality` outright for PNG, so it is only ever
      // spread in for JPEG.
      ...(opts.format === "jpeg" && opts.quality !== null ? { quality: opts.quality } : {}),
    });

    const durationMs = Date.now() - started;
    log.info("capture.ok", {
      url: opts.url,
      width: opts.width,
      height: opts.height,
      format: opts.format,
      bytes: buffer.length,
      durationMs,
    });

    return { buffer, width: opts.width, height: opts.height, durationMs };
  } catch (err) {
    const appError = toCaptureError(err, opts.url);
    log.warn("capture.failed", { url: opts.url, code: appError.code });
    throw appError;
  } finally {
    // ALWAYS. A leaked context per failed request degrades the shared browser
    // within a few dozen requests.
    await context.close().catch((err: unknown) => {
      log.warn("capture.context_close_failed", errorFields(err));
    });
  }
}
