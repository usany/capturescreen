/// <reference lib="dom" />
// src/client/components/previewPane.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `preview-pane`, `preview-empty`, `loading-spinner`, `preview-image`,
// `preview-meta`, `preview-error` (planner 4.2).
//
// Four mutually exclusive states driven off one store field. Every branch is
// written on every render — including the ones being turned off — so there is no
// path where a stale error sits under a fresh screenshot.
//
// The `<img>` stays in the DOM and toggles `hidden` rather than being created
// and destroyed. Recreating it would discard the decoded bitmap on every state
// change, and `preview-image` is the element the e2e suite reads `naturalWidth`
// from; it should be a stable node.

import { $, formatKb, formatSeconds, setHidden, setText } from "../dom.ts";
import { getLang, t } from "../i18n.ts";
import type { AppState, Store } from "../store.ts";
import type { ScreenshotData } from "../../types/api.ts";

/**
 * `1980 x 1080 · PNG · 471 KB · 2.4s`
 *
 * The separator is U+00D7 MULTIPLICATION SIGN with spaces on both sides — the
 * e2e spec asserts `preview-meta` contains `1980 × 1080`, so this exact spacing
 * is part of the contract, not a typographic preference.
 */
export function formatMeta(data: ScreenshotData): string {
  return [
    `${data.width} × ${data.height}`,
    data.format.toUpperCase(),
    formatKb(data.bytes),
    formatSeconds(data.durationMs),
  ].join(" · ");
}

export function mountPreviewPane(root: ParentNode, store: Store): void {
  const empty = $("preview-empty", root);
  const spinner = $("loading-spinner", root);
  const image = $<HTMLImageElement>("preview-image", root);
  const meta = $("preview-meta", root);
  const errorEl = $("preview-error", root);

  const render = (state: AppState) => {
    const hasResult = state.status === "success" && state.result !== null;

    setHidden(empty, state.status !== "idle");
    setHidden(spinner, state.status !== "loading");
    setHidden(image, !hasResult);
    setHidden(meta, !hasResult);
    setHidden(errorEl, state.status !== "error");

    if (hasResult && state.result) {
      const result = state.result;
      const src = result.image ?? "";
      // Guarded: reassigning an identical `src` restarts the decode and makes
      // `naturalWidth` momentarily 0.
      if (src && image.getAttribute("src") !== src) image.src = src;
      image.alt = t(getLang(), "screenshotOf", { url: result.url });
      setText(meta, formatMeta(result));
    } else {
      // Drop the bitmap so a failed re-capture cannot leave the previous
      // screenshot on screen looking like the current one.
      if (image.hasAttribute("src")) image.removeAttribute("src");
      setText(meta, "");
    }

    if (state.status === "error" && state.error) {
      setText(errorEl, state.error.message);
    }
  };

  store.subscribe(render);
  render(store.getState());
}
