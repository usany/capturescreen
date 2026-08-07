// src/client/actions.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// The capture side-effect, in one place.
//
// Deviation from planner 6, and the reason for it: the plan sketches
// `mountX(root, store)` and leaves the capture call unowned. Four components can
// start a capture (`capture-btn`, Enter in `url-input`, the auto-capture timer,
// and the two re-capture download buttons). Duplicating the fetch-and-transition
// sequence in four places is how the loading flag and the store status drift
// apart, so components receive a third argument: this object. Mount signatures
// are `mountX(root, store, actions)`.
//
// Everything else about the plan holds — components still own only their own
// DOM, and the store is still the only channel between them.

import { requestScreenshot, toStoreError } from "./api.ts";
import { preloadImage } from "./dom.ts";
import type { Store } from "./store.ts";
import type { ImageFormat } from "../types/api.ts";
import { validateUrlShape } from "./components/urlInput.ts";

export interface CaptureOptions {
  /** Re-capture in a different encoding without the user touching `format-select`. */
  format?: ImageFormat;
}

export interface Actions {
  /** Run a capture. Resolves `true` on success — the download buttons await it. */
  capture(options?: CaptureOptions): Promise<boolean>;
}

export function createActions(store: Store): Actions {
  return {
    async capture(options: CaptureOptions = {}): Promise<boolean> {
      const state = store.getState();

      // Re-entrancy guard. `capture-btn` is disabled while loading, but the
      // auto-capture timer and the download buttons are not gated by the DOM.
      if (state.status === "loading") return false;

      const check = validateUrlShape(state.url);
      if (!check.valid) {
        store.setState({
          status: "error",
          result: null,
          error: { code: "INVALID_URL", message: check.reason ?? "Enter a valid http(s) URL" },
        });
        return false;
      }

      const format = options.format ?? state.format;
      // A format override is a real state change: `format-select` follows it, so
      // clicking "Download JPEG" leaves the UI describing what is on screen.
      store.setState({ status: "loading", error: null, format });

      try {
        const data = await requestScreenshot({
          // Sent as typed (trimmed). The server owns normalization and echoes
          // back both `requestedUrl` and the resolved `url`.
          url: state.url.trim(),
          width: state.width,
          height: state.height,
          format,
          quality: state.quality,
          fullPage: state.fullPage,
        });

        // Decode before announcing success, so `preview-image.naturalWidth` is
        // already correct the moment `capture-btn[data-state=success]` appears.
        await preloadImage(data.image);

        store.setState({ status: "success", result: data, error: null });
        return true;
      } catch (err) {
        store.setState({ status: "error", result: null, error: toStoreError(err) });
        return false;
      }
    },
  };
}
