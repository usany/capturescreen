/// <reference lib="dom" />
// src/client/components/downloadBar.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `download-bar`, `download-btn`, `download-png-btn`, `download-jpeg-btn`
// (planner 4.2).
//
// `download-btn` is a real `<a download href="/api/screenshot/{id}/download">`,
// not a button that builds a blob. That is deliberate (planner A3): a same-origin
// anchor with `download` is what makes the browser fire a genuine download, which
// is what `page.waitForEvent("download")` observes and where
// `suggestedFilename()` comes from. A JS-driven blob download is invisible to
// that API in some browsers, so the anchor is load-bearing — do not "improve" it
// into a click handler.
//
// The two format buttons re-capture only when the format actually differs; when
// it already matches they just trigger the existing anchor rather than spending
// a browser navigation to produce an identical image.

import { $, on, setHidden } from "../dom.ts";
import type { AppState, Store } from "../store.ts";
import type { Actions } from "../actions.ts";
import type { ImageFormat } from "../../types/api.ts";

export function mountDownloadBar(root: ParentNode, store: Store, actions: Actions): void {
  const bar = $("download-bar", root);
  const anchor = $<HTMLAnchorElement>("download-btn", root);
  const pngBtn = $<HTMLButtonElement>("download-png-btn", root);
  const jpegBtn = $<HTMLButtonElement>("download-jpeg-btn", root);

  const render = (state: AppState) => {
    const result = state.status === "success" ? state.result : null;
    setHidden(bar, result === null);

    if (!result) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("download");
      return;
    }
    if (anchor.getAttribute("href") !== result.downloadUrl) anchor.href = result.downloadUrl;
    if (anchor.getAttribute("download") !== result.filename) {
      anchor.setAttribute("download", result.filename);
    }
  };

  const downloadAs = async (format: ImageFormat) => {
    const current = store.getState().result;

    if (!current || current.format !== format) {
      const ok = await actions.capture({ format });
      // A failed re-capture already surfaced in `preview-error`; clicking a
      // stale anchor here would hand the user the *previous* format's file.
      if (!ok) return;
    }

    // Read after the render pass so the href points at the new job id.
    const href = anchor.getAttribute("href");
    if (href) anchor.click();
  };

  on(pngBtn, "click", () => void downloadAs("png"));
  on(jpegBtn, "click", () => void downloadAs("jpeg"));

  store.subscribe(render);
  render(store.getState());
}
