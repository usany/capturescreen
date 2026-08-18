/// <reference lib="dom" />
// src/client/components/urlInput.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// `url-input`, `url-error`, `auto-capture-toggle` (planner 4.2).
//
// Two independent timers hang off the same keystroke, and conflating them is
// the easy mistake:
//
//   400 ms  validation  -> writes `state.url`, shows/clears `url-error`, and
//                          (via the status banner) enables `capture-btn`
//   900 ms  auto-capture-> fires an actual capture, ONLY when the toggle is on
//
// Validation has to be the fast one: the button must become clickable well
// before anything is spent launching a browser. Auto-capture is the slow one and
// defaults OFF, because a capture per keystroke is a chromium navigation per
// keystroke.

import { $, debounce, on, setHidden, setText } from "../dom.ts";
import { translate } from "../i18n.ts";
import type { Store } from "../store.ts";
import type { Actions } from "../actions.ts";

const VALIDATE_DEBOUNCE_MS = 400;
const AUTO_CAPTURE_IDLE_MS = 900;

const INVALID_MESSAGE = "Enter a valid http(s) URL";

/** i18n key for the single validation complaint the UI shows. */
const INVALID_KEY = "url.invalid";

export interface UrlCheck {
  valid: boolean;
  /** Absolute URL, present only when `valid`. Informational — the raw text is sent. */
  normalized?: string;
  reason?: string;
}

/** Already carries a scheme, e.g. `https://`, `ftp://`, `javascript:`. */
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Client-side shape check. Intentionally *not* the server's validator — it only
 * decides whether `capture-btn` is worth enabling. The server re-validates and
 * owns the authoritative rejection.
 *
 * A bare host is treated as https, matching the server's normalization, but a
 * hostname still has to look like a hostname. Without that last rule typing a
 * single "e" produces `https://e` — a URL the parser happily accepts — and the
 * button would flicker enabled on the first keystroke of every session.
 */
export function validateUrlShape(raw: string): UrlCheck {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { valid: false, reason: INVALID_MESSAGE };

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, reason: INVALID_MESSAGE };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: INVALID_MESSAGE };
  }

  const host = parsed.hostname;
  const plausibleHost = host === "localhost" || IPV4.test(host) ||
    host.startsWith("[") || /\.[a-z]{2,}$/i.test(host);
  if (!plausibleHost) return { valid: false, reason: INVALID_MESSAGE };

  return { valid: true, normalized: parsed.href };
}

export function mountUrlInput(root: ParentNode, store: Store, actions: Actions): void {
  const input = $<HTMLInputElement>("url-input", root);
  const errorEl = $("url-error", root);
  const autoToggle = $<HTMLInputElement>("auto-capture-toggle", root);

  const commit = () => {
    const value = input.value;
    const check = validateUrlShape(value);
    store.setState({ url: value });

    // An untouched field is not an error state — only complain once the user has
    // typed something that cannot work.
    const showError = value.trim().length > 0 && !check.valid;
    setText(errorEl, translate(store.getState().lang, INVALID_KEY));
    setHidden(errorEl, !showError);
  };

  const validateLater = debounce(commit, VALIDATE_DEBOUNCE_MS);
  const autoCaptureLater = debounce(() => {
    const state = store.getState();
    if (!state.autoCapture) return;
    if (state.status === "loading") return;
    if (!validateUrlShape(input.value).valid) return;
    commit();
    void actions.capture();
  }, AUTO_CAPTURE_IDLE_MS);

  on(input, "input", () => {
    validateLater.run();
    autoCaptureLater.cancel();
    if (store.getState().autoCapture) autoCaptureLater.run();
  });

  // Leaving the field should not make the user wait out the debounce.
  on(input, "blur", () => {
    validateLater.cancel();
    commit();
  });

  on(input, "keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    event.preventDefault();
    // Enter is an explicit intent: skip both debounces entirely.
    validateLater.cancel();
    autoCaptureLater.cancel();
    commit();
    void actions.capture();
  });

  on(autoToggle, "change", () => {
    const enabled = autoToggle.checked;
    store.setState({ autoCapture: enabled });
    if (!enabled) autoCaptureLater.cancel();
  });

  store.subscribe((state) => {
    // The store is authoritative for programmatic changes (e.g. a restored
    // value); a live edit must never have the caret yanked out from under it.
    if (document.activeElement !== input && input.value !== state.url) {
      input.value = state.url;
    }
    if (autoToggle.checked !== state.autoCapture) autoToggle.checked = state.autoCapture;
  });

  input.value = store.getState().url;
  autoToggle.checked = store.getState().autoCapture;
  setHidden(errorEl, true);
}
