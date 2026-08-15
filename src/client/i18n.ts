/// <reference lib="dom" />
// src/client/i18n.ts
// Author: agent
// Created: 2026-08-16
//
// Client-facing i18n. The dictionaries and `t()` live in src/lib/i18n.ts — the
// single source of truth shared with the server-side page renderer — so the
// client adds only the browser-specific part on top of it.
//
// Language is decided by the ROUTE, server-side: `/en/` and `/ko/` both render
// the same template from that dictionary. The client never changes the language
// at runtime (the toggle is a plain <a> link), so it just reads the language the
// server already stamped onto `<html lang>` and uses `t()` for the small set of
// strings it produces at runtime: the capture-button label, inline validation
// messages, and the preview image alt.

import { DICTS, isLang, LANGS, t } from "../lib/i18n.ts";
import type { Lang } from "../lib/i18n.ts";

export { DICTS, isLang, LANGS, t };
export type { Lang };

/**
 * The language this page was served in. The server writes it onto the
 * `<html lang>` attribute for each route (`/en/` vs `/ko/`), so the client just
 * reads it back — no guessing, no storage. Defaults to English defensively.
 */
export function getLang(): Lang {
  const value = globalThis.document?.documentElement?.getAttribute("lang");
  return isLang(value) ? value : "en";
}
