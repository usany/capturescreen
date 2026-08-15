/// <reference lib="dom" />
// src/client/main.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// Bootstrap, and nothing else (planner 6). Seed the store, mount the six
// components against `document`, done. There is no render loop here — each
// component subscribes to the store itself and writes only the attributes it
// owns, so "re-render" is a handful of attribute writes with no diffing.
//
// Bundled to `public/js/app.js` by `deno task build:client` and loaded as
// `<script type="module">`, which defers execution until the document is parsed.
// That is why nothing waits on DOMContentLoaded.

import { createStore } from "./store.ts";
import type { AppState } from "./store.ts";
import { createActions } from "./actions.ts";
import { getInitialSize } from "./components/sizeControls.ts";
import { mountUrlInput } from "./components/urlInput.ts";
import { mountSizeControls } from "./components/sizeControls.ts";
import { mountFormatSelector } from "./components/formatSelector.ts";
import { mountPreviewPane } from "./components/previewPane.ts";
import { mountDownloadBar } from "./components/downloadBar.ts";
import { mountStatusBanner } from "./components/statusBanner.ts";
import { mountThemeToggle } from "./components/themeToggle.ts";

function initialState(): AppState {
  // Screen size, or a remembered size from a previous visit. See sizeControls
  // for why those two are not the same rule.
  const { width, height } = getInitialSize();
  return {
    url: "",
    width,
    height,
    format: "png",
    quality: 90,
    fullPage: false,
    // OFF by default: auto-capture means a chromium navigation per typing pause.
    autoCapture: false,
    status: "idle",
    result: null,
    error: null,
  };
}

function start(): void {
  const store = createStore(initialState());
  const actions = createActions(store);

  // Status banner first: it owns `capture-btn`, and mounting it before the URL
  // field means the button is already in its correct disabled state by the time
  // the first keystroke can arrive.
  // Theme first: applying the `dark` class pre-paint avoids a flash of the
  // wrong theme before the rest of the controls mount.
  mountThemeToggle(document);
  mountStatusBanner(document, store, actions);
  mountUrlInput(document, store, actions);
  mountSizeControls(document, store);
  mountFormatSelector(document, store);
  mountPreviewPane(document, store);
  mountDownloadBar(document, store, actions);

  // Read-only introspection hook for debugging and for e2e assertions that are
  // awkward to express through the DOM. Intentionally exposes no setter.
  (globalThis as unknown as { __APP__?: unknown }).__APP__ = {
    getState: () => store.getState(),
  };
}

start();
