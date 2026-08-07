// src/services/browser.service.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Ownership of the single shared chromium instance (planner A4). Launching
// costs ~700ms; a BrowserContext costs ~20ms, so we pay the launch once and
// give every request its own context instead.
//
// Two properties the test suite leans on:
//   - GET /api/health must answer while this is still booting, so nothing here
//     is imported into the health path.
//   - A navigation failure must never tear the browser down (B9). Only an
//     actual launch failure or a disconnect clears the memo.

import { type Browser, chromium } from "playwright";
import { AppError, ERROR_CODES } from "../lib/errors.ts";
import { errorFields, log } from "../lib/logger.ts";
import type { BrowserInfo } from "../types/server.ts";

const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];

let browser: Browser | null = null;
/** In-flight launch, so N concurrent first requests share one chromium. */
let launching: Promise<Browser> | null = null;
/** Set when the last launch attempt failed; surfaces as status "degraded". */
let lastLaunchFailed = false;

async function launch(): Promise<Browser> {
  log.info("browser.launching");
  const started = Date.now();

  const instance = await chromium.launch({ headless: true, args: LAUNCH_ARGS });

  // A crashed or externally killed chromium must not leave a stale handle
  // behind — the next request should launch a fresh one rather than fail.
  instance.on("disconnected", () => {
    log.warn("browser.disconnected");
    if (browser === instance) {
      browser = null;
      launching = null;
    }
  });

  lastLaunchFailed = false;
  log.info("browser.ready", { launchMs: Date.now() - started, version: instance.version() });
  return instance;
}

/**
 * Get the shared browser, launching it on first use.
 *
 * The memo holds the in-flight promise, not just the result, so concurrent
 * cold-start requests do not each launch their own chromium. A failed launch
 * clears the memo so the next request genuinely retries.
 */
export function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return Promise.resolve(browser);
  if (launching) return launching;

  launching = launch()
    .then((instance) => {
      browser = instance;
      launching = null;
      return instance;
    })
    .catch((err) => {
      browser = null;
      launching = null;
      lastLaunchFailed = true;
      log.error("browser.launch_failed", errorFields(err));
      throw new AppError(
        ERROR_CODES.BROWSER_UNAVAILABLE,
        "The screenshot browser could not be started. Please try again shortly.",
      );
    });

  return launching;
}

export function isBrowserReady(): boolean {
  return browser !== null && browser.isConnected();
}

/** True when the most recent launch attempt failed and none has since worked. */
export function isBrowserDegraded(): boolean {
  return lastLaunchFailed && !isBrowserReady();
}

/** Safe to call before any launch — never triggers one. */
export function getBrowserInfo(): BrowserInfo {
  return {
    connected: isBrowserReady(),
    name: "chromium",
    version: browser?.isConnected() ? browser.version() : null,
  };
}

/** Called from the SIGINT/SIGTERM handlers so no chromium outlives the process. */
export async function closeBrowser(): Promise<void> {
  const instance = browser;
  browser = null;
  launching = null;
  if (!instance) return;

  try {
    await instance.close();
    log.info("browser.closed");
  } catch (err) {
    log.warn("browser.close_failed", errorFields(err));
  }
}
