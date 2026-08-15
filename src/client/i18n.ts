/// <reference lib="dom" />
// src/client/i18n.ts
// Author: agent
// Created: 2026-08-16
//
// A tiny hand-rolled i18n layer matching the prevailing "no-framework"
// philosophy of the client (see src/client/store.ts). Two fixed audiences —
// English and Korean — so there is no need for a locale database or a loader:
// two flat dictionaries and a `t()` lookup with `{var}` interpolation.
//
// Design notes:
//   * `lang` lives in the store (src/client/store.ts) like every other piece of
//     UI state, so a toggle goes through the one notification path and every
//     component re-renders only what data-i18n/component text it owns.
//   * The chosen language is persisted to localStorage (urlshot:lang). A
//     non-corrupt stored value wins; otherwise we fall back to the browser
//     language (ko -> Korean) and finally English.
//   * Static markup is translated declaratively via `data-i18n="key"` /
//     `data-i18n-attr="placeholder"` / `data-i18n-title="key"`, applied by
//     src/client/components/langSelector.ts. Dynamic text (status banner,
//     validation messages, preview alt) is translated in the component that
//     renders it, from `t()` below.

/** The two supported languages. `"en"` is the default. */
export type Lang = "en" | "ko";

export const LANG_STORAGE_KEY = "urlshot:lang";

export const LANGS: readonly Lang[] = ["en", "ko"];

/** English strings — the baseline; every render falls back to these. */
const EN: Record<string, string> = {
  title: "URL Screenshot",
  subtitle: "Capture any page at any viewport size, then download it as PNG or JPEG.",
  captureSettings: "Capture settings",
  screenshotPreview: "Screenshot preview",

  pageUrl: "Page URL",
  placeholder: "https://example.com",
  capture: "Capture",
  capturing: "Capturing…",
  invalidUrl: "Enter a valid http(s) URL",
  autoCapture: "Auto-capture when I stop typing",

  width: "Width",
  height: "Height",
  resetSize: "Reset to screen size",
  resetSizeTitle: "Reset to this screen's size",
  widthRange: "Width must be between {min} and {max}.",
  heightRange: "Height must be between {min} and {max}.",

  format: "Format",
  quality: "Quality",
  fullPage: "Full page",

  previewEmpty: "Preview will appear here",
  screenshotOf: "Screenshot of {url}",

  download: "Download",
  downloadPng: "Download as PNG",
  downloadJpeg: "Download as JPEG",

  statusChecking: "Checking…",
  statusReady: "Ready",
  statusStarting: "Starting…",
  statusDegraded: "Degraded",
  statusUnreachable: "Unreachable",

  langSelfName: "English",
  switchTo: "Switch to {lang}",
};

/** Korean strings. Keys missing here fall back to the English entry. */
const KO: Record<string, string> = {
  title: "URL 스크린샷",
  subtitle: "모든 뷰포트 크기에서 페이지를 캡처한 뒤 PNG 또는 JPEG로 다운로드하세요.",
  captureSettings: "캡처 설정",
  screenshotPreview: "스크린샷 미리보기",

  pageUrl: "페이지 URL",
  placeholder: "https://example.com",
  capture: "캡처",
  capturing: "캡처 중…",
  invalidUrl: "유효한 http(s) 주소를 입력하세요",
  autoCapture: "입력을 멈추면 자동 캡처",

  width: "너비",
  height: "높이",
  resetSize: "화면 크기로 초기화",
  resetSizeTitle: "이 화면의 크기로 초기화",
  widthRange: "너비는 {min}에서 {max} 사이여야 합니다.",
  heightRange: "높이는 {min}에서 {max} 사이여야 합니다.",

  format: "형식",
  quality: "품질",
  fullPage: "전체 페이지",

  previewEmpty: "미리보기가 여기에 표시됩니다",
  screenshotOf: "{url} 스크린샷",

  download: "다운로드",
  downloadPng: "PNG로 다운로드",
  downloadJpeg: "JPEG로 다운로드",

  statusChecking: "확인 중…",
  statusReady: "준비됨",
  statusStarting: "시작 중…",
  statusDegraded: "저하됨",
  statusUnreachable: "연결 불가",

  langSelfName: "한국어",
  switchTo: "{lang}(으)로 전환",
};

const DICTS: Record<Lang, Record<string, string>> = { en: EN, ko: KO };

/** The narrow pieces of `globalThis` i18n needs, in the same style as dom.ts. */
const g = globalThis as {
  localStorage?: Storage;
  navigator?: { language?: string };
};

/**
 * Look up a translated string. Missing keys fall back to English, then to the
 * key itself — so a typo renders loudly as the key instead of silently blank.
 * `vars` allows `{name}` interpolation inside a template.
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ko";
}

/** The language the app boots with: stored choice, else browser default, else English. */
export function getInitialLang(): Lang {
  try {
    const raw = g.localStorage?.getItem(LANG_STORAGE_KEY);
    if (isLang(raw)) return raw;
  } catch {
    // Storage blocked or unavailable — fall through to browser detection.
  }
  try {
    if (g.navigator?.language?.toLowerCase().startsWith("ko")) return "ko";
  } catch {
    // No navigator available — the (non-browser) default is English.
  }
  return "en";
}

/** The other language — what clicking the toggle switches to. */
export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "ko" : "en";
}
