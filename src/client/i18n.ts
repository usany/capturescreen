/// <reference lib="dom" />
// src/client/i18n.ts
// Author: client-side-writer
// Created: 2026-08-19
//
// The one dictionary the whole UI reads from. There is no template engine: the
// page is static HTML, so visible text is either
//
//   * written by a component at render time (capture button, status banner,
//     validation messages) — those call `translate(lang, key)`, or
//   * baked into `public/index.html` behind a `data-i18n="key"` attribute —
//     `applyLanguage` rewrites those in one pass from this table.
//
// Everything reads off the SAME `en`/`ko` tables, so a string can never be
// translated in one path and forgotten in another.

export type Lang = "en" | "ko";
export const LANGS: readonly Lang[] = ["en", "ko"];

/** Cookie name shared with the server (src/routes/lang.route.ts). */
export const LANG_COOKIE = "lang";

/** Brand, file names and language-neutral bits stay untranslated. */
const STRINGS = {
  en: {
    "app.title": "URL Screenshot",
    "app.tagline": "Capture any page at any viewport size, then download it as PNG or JPEG.",
    "url.label": "Page URL",
    "url.placeholder": "https://example.com",
    "url.invalid": "Enter a valid http(s) URL",
    "capture.action": "Capture",
    "capture.busy": "Capturing…",
    "autoCapture": "Auto-capture when I stop typing",
    "size.width": "Width",
    "size.height": "Height",
    "size.reset": "Reset to screen size",
    "size.widthRange": "Width must be between {minWidth} and {maxWidth}.",
    "size.heightRange": "Height must be between {minHeight} and {maxHeight}.",
    "format.label": "Format",
    "quality.label": "Quality",
    "fullpage": "Full page",
    "preview.empty": "Preview will appear here",
    "status.checking": "Checking…",
    "status.ready": "Ready",
    "status.starting": "Starting…",
    "status.degraded": "Degraded",
    "status.unreachable": "Unreachable",
    "download": "Download",
    "download.png": "Download as PNG",
    "download.jpeg": "Download as JPEG",
    "error.generic": "Something went wrong.",
    "theme.light": "Light mode",
    "theme.dark": "Dark mode",
    "theme.action.light": "Switch to light mode",
    "theme.action.dark": "Switch to dark mode",
    "lang.action.ko": "Switch to Korean",
    "lang.action.en": "Switch to English",
  },
  ko: {
    "app.title": "URL Screenshot",
    "app.tagline": "모든 페이지를 원하는 크기로 캡처한 뒤 PNG 또는 JPEG로 다운로드하세요.",
    "url.label": "페이지 URL",
    "url.placeholder": "https://example.com",
    "url.invalid": "유효한 http(s) URL을 입력하세요.",
    "capture.action": "캡처",
    "capture.busy": "캡처 중…",
    "autoCapture": "입력을 멈추면 자동 캡처",
    "size.width": "너비",
    "size.height": "높이",
    "size.reset": "화면 크기로 초기화",
    "size.widthRange": "너비는 {minWidth} ~ {maxWidth} 사이여야 합니다.",
    "size.heightRange": "높이는 {minHeight} ~ {maxHeight} 사이여야 합니다.",
    "format.label": "형식",
    "quality.label": "품질",
    "fullpage": "전체 페이지",
    "preview.empty": "미리보기가 여기에 표시됩니다",
    "status.checking": "확인 중…",
    "status.ready": "준비됨",
    "status.starting": "시작 중…",
    "status.degraded": "저하됨",
    "status.unreachable": "연결 불가",
    "download": "다운로드",
    "download.png": "PNG로 다운로드",
    "download.jpeg": "JPEG로 다운로드",
    "error.generic": "문제가 발생했습니다.",
    "theme.light": "라이트 모드",
    "theme.dark": "다크 모드",
    "theme.action.light": "라이트 모드로 전환",
    "theme.action.dark": "다크 모드로 전환",
    "lang.action.ko": "한국어로 전환",
    "lang.action.en": "영어로 전환",
  },
} as const;

export type I18nKey = keyof typeof STRINGS.en;

const FALLBACK_LANG: Lang = "en";

/**
 * Look up a string for a language. `{name}` placeholders are filled from
 * `params`; a missing key falls back to English, then to the key itself so the
 * UI never crashes on a typo.
 */
export function translate(
  lang: Lang,
  key: I18nKey,
  params: Record<string, string | number> = {},
): string {
  const table: Record<I18nKey, string> = STRINGS[lang] ?? STRINGS[FALLBACK_LANG];
  const template = table[key] ?? STRINGS[FALLBACK_LANG][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Read the `lang` cookie, validating against the known set. */
export function readCookieLang(): Lang | null {
  try {
    const match = /(?:^|;\s*)lang=([a-z]{2})/.exec(document.cookie);
    if (!match) return null;
    return match[1] === "ko" ? "ko" : match[1] === "en" ? "en" : null;
  } catch {
    return null;
  }
}

/** Write the `lang` cookie so a reload keeps the choice (mirrors /en, /ko). */
export function writeCookieLang(lang: Lang): void {
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
  } catch {
    // Storage unavailable — persistence is a convenience, never a gate.
  }
}

/** The language implied by the route: `/en` -> en, `/ko` -> ko, else null. */
function readPathLang(): Lang | null {
  try {
    const seg = (location.pathname ?? "").split("/");
    for (const s of seg) if (s === "en" || s === "ko") return s;
    return null;
  } catch {
    return null;
  }
}

/** Rewrite the URL to the matching /en or /ko route without a reload. */
export function setPathLang(lang: Lang): void {
  try {
    history.replaceState(null, "", `/${lang}`);
  } catch {
    // History unavailable (rare) — the cookie still carries the choice.
  }
}

/**
 * The language to boot with: the explicit route (/en, /ko) wins, then the
 * `lang` cookie (the client toggle, and /en+/ko, write it), then the browser
 * UI, then English.
 */
export function initialLang(): Lang {
  const routed = readPathLang();
  if (routed) return routed;
  const cookie = readCookieLang();
  if (cookie) return cookie;
  try {
    const preferred = navigator.language?.toLowerCase().slice(0, 2);
    return preferred === "ko" ? "ko" : FALLBACK_LANG;
  } catch {
    return FALLBACK_LANG;
  }
}

/**
 * Rewrite every `data-i18n` text node, `data-i18n-ph` placeholder and the
 * document metadata in one pass. Idempotent, so it is safe to call on every
 * toggle and on first paint.
 */
export function applyLanguage(lang: Lang, root: ParentNode & Node = document): void {
  document.documentElement.lang = lang;
  document.title = translate(lang, "app.title");

  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n as I18nKey;
    if (el.textContent !== translate(lang, key)) el.textContent = translate(lang, key);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-ph]")) {
    const key = el.dataset.i18nPh as I18nKey;
    if (el.getAttribute("placeholder") !== translate(lang, key)) {
      el.setAttribute("placeholder", translate(lang, key));
    }
  }
}
