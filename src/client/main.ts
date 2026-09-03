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
import { getInitialTheme, mountThemeToggle } from "./components/themeToggle.ts";
import { initialLang } from "./i18n.ts";
import { mountLangToggle } from "./components/langToggle.ts";
import { mountUrlInput } from "./components/urlInput.ts";
import { mountSizeControls } from "./components/sizeControls.ts";
import { mountFormatSelector } from "./components/formatSelector.ts";
import { mountPreviewPane } from "./components/previewPane.ts";
import { mountDownloadBar } from "./components/downloadBar.ts";
function initialState(): AppState {
  // Screen size, or a remembered size from a previous visit. See sizeControls
  // for why those two are not the same rule.
  const { width, height } = getInitialSize();
  return {
    // Cookie wins; `/en` and `/ko` are the URL-side way to set it.
    lang: initialLang(),
    url: "",
    width,
    height,
    format: "png",
    quality: 90,
    fullPage: false,
    // OFF by default: auto-capture means a chromium navigation per typing pause.
    autoCapture: false,
    // Remembered choice, else the OS preference; persisted under `urlshot:theme`.
    theme: getInitialTheme(),
    status: "idle",
    result: null,
    error: null,
  };
}

function start(): void {
  const store = createStore(initialState());
  const actions = createActions(store);

  mountThemeToggle(document, store);
  mountLangToggle(document, store);
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
