/// <reference lib="dom" />
// src/client/components/sizeControls.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `width-input`, `height-input`, `reset-size-btn`, `dimension-error`,
// `fullpage-toggle` (planner 4.2).
//
// The hard requirement here is the default: on a first load the two inputs must
// read `window.screen.width` / `window.screen.height` — the size of the display,
// not `innerWidth`/`innerHeight`, which are the size of this browser window and
// shrink with devtools open. Under headless Playwright `screen.*` is the
// emulated device screen, which is why the e2e spec can compare against it at
// runtime instead of hard-coding numbers.
//
// Persistence and that requirement pull in opposite directions, so they are
// split: `localStorage` wins on reload (the user's deliberate choice survives),
// but `reset-size-btn` always re-reads the *live* screen, never the stored copy.

import { $, on, setHidden, setText, win } from "../dom.ts";
import { translate } from "../i18n.ts";
import type { Store } from "../store.ts";

export const SIZE_STORAGE_KEY = "urlshot:size";

/** Mirrors `LIMITS` in `src/config.ts`; the server re-validates authoritatively. */
export const SIZE_LIMITS = {
  minWidth: 200,
  maxWidth: 5000,
  minHeight: 200,
  maxHeight: 20_000,
} as const;

const FALLBACK = { width: 1280, height: 720 } as const;

export interface Size {
  width: number;
  height: number;
}

/** Clamp into an inclusive range, ignoring non-finite input. */
export function clampDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The live display size: `window.screen` first, `innerWidth/innerHeight` when
 * `screen` is missing, then 1280x720.
 *
 * Deliberately NOT clamped. The requirement is that the inputs equal the screen
 * size exactly; a display outside the server's range should surface as a visible
 * `dimension-error` the user can correct, not as a number silently rewritten
 * behind their back.
 */
export function getScreenDefaults(): Size {
  const screen = win.screen;
  const width = screen?.width ?? win.innerWidth ?? FALLBACK.width;
  const height = screen?.height ?? win.innerHeight ?? FALLBACK.height;
  return {
    width: Math.round(width) || FALLBACK.width,
    height: Math.round(height) || FALLBACK.height,
  };
}

function readStoredSize(): Size | null {
  try {
    const raw = win.localStorage?.getItem(SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Size>;
    if (!Number.isFinite(parsed?.width) || !Number.isFinite(parsed?.height)) return null;
    return {
      width: Math.round(parsed.width as number),
      height: Math.round(parsed.height as number),
    };
  } catch {
    // Corrupt JSON, or storage blocked by a privacy setting. Fall back silently.
    return null;
  }
}

function writeStoredSize(size: Size): void {
  try {
    win.localStorage?.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Storage full or unavailable — persistence is a convenience, never a gate.
  }
}

/** The size the app boots with: a remembered choice if there is one, else the screen. */
export function getInitialSize(): Size {
  return readStoredSize() ?? getScreenDefaults();
}

function describeProblemKey(size: Size): "size.widthRange" | "size.heightRange" | null {
  const { minWidth, maxWidth, minHeight, maxHeight } = SIZE_LIMITS;
  if (!Number.isFinite(size.width) || size.width < minWidth || size.width > maxWidth) {
    return "size.widthRange";
  }
  if (!Number.isFinite(size.height) || size.height < minHeight || size.height > maxHeight) {
    return "size.heightRange";
  }
  return null;
}

export function mountSizeControls(root: ParentNode, store: Store): void {
  const widthInput = $<HTMLInputElement>("width-input", root);
  const heightInput = $<HTMLInputElement>("height-input", root);
  const resetBtn = $<HTMLButtonElement>("reset-size-btn", root);
  const errorEl = $("dimension-error", root);
  const fullPageToggle = $<HTMLInputElement>("fullpage-toggle", root);

  const readInputs = (): Size => ({
    width: Number.parseInt(widthInput.value, 10),
    height: Number.parseInt(heightInput.value, 10),
  });

  const commit = () => {
    const size = readInputs();
    const problemKey = describeProblemKey(size);

    const { lang } = store.getState();
    const bounds = { ...SIZE_LIMITS } as Record<string, number>;
    setText(
      errorEl,
      problemKey ? translate(lang, problemKey, bounds) : "",
    );
    setHidden(errorEl, problemKey === null);

    // Only a usable pair reaches the store and localStorage. A half-typed "12"
    // on its way to "1280" must not overwrite a good remembered value.
    if (problemKey === null) {
      store.setState(size);
      writeStoredSize(size);
    }
  };

  on(widthInput, "input", commit);
  on(heightInput, "input", commit);

  on(resetBtn, "click", () => {
    const defaults = getScreenDefaults();
    widthInput.value = String(defaults.width);
    heightInput.value = String(defaults.height);
    store.setState(defaults);
    writeStoredSize(defaults);
    const key = describeProblemKey(defaults);
    const { lang } = store.getState();
    setText(errorEl, key ? translate(lang, key, { ...SIZE_LIMITS }) : "");
    setHidden(errorEl, key === null);
  });

  on(fullPageToggle, "change", () => {
    store.setState({ fullPage: fullPageToggle.checked });
  });

  store.subscribe((state) => {
    if (document.activeElement !== widthInput && widthInput.value !== String(state.width)) {
      widthInput.value = String(state.width);
    }
    if (document.activeElement !== heightInput && heightInput.value !== String(state.height)) {
      heightInput.value = String(state.height);
    }
    if (fullPageToggle.checked !== state.fullPage) fullPageToggle.checked = state.fullPage;
  });

  const initial = store.getState();
  widthInput.value = String(initial.width);
  heightInput.value = String(initial.height);
  fullPageToggle.checked = initial.fullPage;
  const initialKey = describeProblemKey(initial);
  setHidden(errorEl, initialKey === null);
  setText(errorEl, initialKey ? translate(initial.lang, initialKey, { ...SIZE_LIMITS }) : "");
}
