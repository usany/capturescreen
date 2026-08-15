// tests/helpers/ui.ts
// Author: qa-tester
// Created: 2026-07-26
//
// Page-level vocabulary for the e2e suite. Integration specs talk to the API;
// these specs drive the real page, so they need a different set of primitives.
//
// Two things here are load-bearing rather than convenience:
//
//   1. `settle()` waits on `capture-btn[data-state]` reaching a TERMINAL state
//      (success or error), never on `success` alone. Waiting only for success
//      turns every server-side failure into an opaque 60 s timeout; waiting for
//      either lets the caller surface `preview-error`'s actual prose in the
//      failure message. That is the difference between "the test timed out" and
//      "the site refused the connection".
//
//   2. `enterUrl()` waits for `capture-btn` to become enabled instead of
//      sleeping. `url-input` validates on a 400 ms trailing debounce
//      (src/client/components/urlInput.ts), so the button is NOT clickable on
//      the tick after `fill()` returns. A hard-coded wait would be both slower
//      and flakier than polling the thing we actually care about.

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { TESTIDS } from "./constants.ts";

/** Terminal states of the capture flow, as mirrored onto `capture-btn[data-state]`. */
export type CaptureState = "success" | "error";

/**
 * A real page fetch plus a chromium capture is not a local operation. The
 * project-wide timeout is 60 s; captures of an external site get their own,
 * larger budget via `test.setTimeout()` in the specs that need it.
 */
export const CAPTURE_TIMEOUT_MS = 90_000;

/** Every testid the e2e suite touches, as ready-made locators. */
export function ui(page: Page) {
  const byId = (id: string): Locator => page.getByTestId(id);
  return {
    urlInput: byId(TESTIDS.urlInput),
    urlError: byId(TESTIDS.urlError),
    autoCaptureToggle: byId(TESTIDS.autoCaptureToggle),
    widthInput: byId(TESTIDS.widthInput),
    heightInput: byId(TESTIDS.heightInput),
    resetSizeBtn: byId(TESTIDS.resetSizeBtn),
    dimensionError: byId(TESTIDS.dimensionError),
    formatSelect: byId(TESTIDS.formatSelect),
    qualityRow: byId(TESTIDS.qualityRow),
    qualitySlider: byId(TESTIDS.qualitySlider),
    qualityValue: byId(TESTIDS.qualityValue),
    fullPageToggle: byId(TESTIDS.fullPageToggle),
    previewPane: byId(TESTIDS.previewPane),
    previewEmpty: byId(TESTIDS.previewEmpty),
    previewImage: byId(TESTIDS.previewImage),
    previewMeta: byId(TESTIDS.previewMeta),
    previewError: byId(TESTIDS.previewError),
    loadingSpinner: byId(TESTIDS.loadingSpinner),
    downloadBar: byId(TESTIDS.downloadBar),
    downloadBtn: byId(TESTIDS.downloadBtn),
    downloadPngBtn: byId(TESTIDS.downloadPngBtn),
    downloadJpegBtn: byId(TESTIDS.downloadJpegBtn),
    statusBanner: byId(TESTIDS.statusBanner),
    statusText: byId(TESTIDS.statusText),
    captureBtn: byId(TESTIDS.captureBtn),
    themeBtn: byId(TESTIDS.themeBtn),
  };
}

/** The live client state exposed by `src/client/main.ts` for introspection. */
export interface AppStateSnapshot {
  url: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  quality: number;
  fullPage: boolean;
  autoCapture: boolean;
  status: "idle" | "loading" | "success" | "error";
  result: { id: string; width: number; height: number; format: string; filename: string } | null;
  error: { code: string; message: string } | null;
}

/** Read `window.__APP__.getState()`. Used where the DOM is a lossy view of state. */
export function appState(page: Page): Promise<AppStateSnapshot> {
  return page.evaluate(() => {
    const app = (globalThis as unknown as { __APP__?: { getState(): unknown } }).__APP__;
    if (!app) throw new Error("window.__APP__ is not exposed — did src/client/main.ts change?");
    return app.getState() as AppStateSnapshot;
  });
}

/** The display size the client seeds its defaults from (planner 4.2 hard requirement). */
export function screenSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: screen.width, height: screen.height }));
}

/**
 * Type a URL and wait until the debounced validator has enabled `capture-btn`.
 * Returns once clicking is actually possible, not once the keystrokes landed.
 */
export async function enterUrl(page: Page, url: string): Promise<void> {
  const { urlInput, captureBtn } = ui(page);
  await urlInput.fill(url);
  await expect(captureBtn, `capture-btn never enabled for "${url}"`).toBeEnabled();
}

/**
 * Wait for the capture flow to reach a terminal state and report which.
 * Never asserts success — see the header note; callers decide, and
 * `expectCaptureSucceeded` turns a failure into a readable message.
 */
export async function settle(
  page: Page,
  timeout = CAPTURE_TIMEOUT_MS,
): Promise<CaptureState> {
  const { captureBtn } = ui(page);
  await expect(captureBtn).toHaveAttribute("data-state", /^(success|error)$/, { timeout });
  return (await captureBtn.getAttribute("data-state")) as CaptureState;
}

/**
 * Wait for a capture and fail with the on-screen error prose when it did not
 * succeed. A capture can fail for reasons that are not this suite's fault
 * (the target site being down); a legible message is what makes that
 * distinguishable from a real regression at 3 a.m.
 */
export async function expectCaptureSucceeded(
  page: Page,
  timeout = CAPTURE_TIMEOUT_MS,
): Promise<void> {
  const state = await settle(page, timeout);
  if (state === "success") return;
  const message = (await ui(page).previewError.textContent())?.trim() ?? "(no message rendered)";
  throw new Error(`Capture ended in the error state. preview-error said: ${message}`);
}

/** Fill the size fields. `fill()` fires `input`, which is what sizeControls listens on. */
export async function setSize(page: Page, width: number, height: number): Promise<void> {
  const { widthInput, heightInput } = ui(page);
  await widthInput.fill(String(width));
  await heightInput.fill(String(height));
}

/** Pixel dimensions of the decoded bitmap in `preview-image`, not its CSS box. */
export function naturalSize(page: Page): Promise<{ width: number; height: number }> {
  return ui(page).previewImage.evaluate((el) => {
    const img = el as HTMLImageElement;
    return { width: img.naturalWidth, height: img.naturalHeight };
  });
}
