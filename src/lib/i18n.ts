// src/lib/i18n.ts
// Author: agent
// Created: 2026-08-16
//
// The SINGLE source of truth for every user-visible string, for both languages.
// Pure data + a lookup function — no DOM, no node builtins — so the same module
// is imported by:
//   * the server renderer (src/lib/page.ts) to fill the page template, and
//   * the browser bundle (src/client/i18n.ts re-exports it) to translate the
//     strings the client produces at runtime (capture button, inline
//     validation, preview alt).
//
// Because it has no runtime dependencies, it is safe to pull into
// `deno bundle --platform=browser`.

export type Lang = "en" | "ko";

export const LANGS: readonly Lang[] = ["en", "ko"] as const;

/** A flat string table. Missing keys fall back to English, then to the key. */
type Dict = Record<string, string>;

const EN: Dict = {
  // document / page shell
  lang: "en",
  title: "URL Screenshot",
  subtitle: "Capture any page at any viewport size, then download it as PNG or JPEG.",
  captureSettings: "Capture settings",
  screenshotPreview: "Screenshot preview",

  // controls
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

  // preview / download
  previewEmpty: "Preview will appear here",
  screenshotOf: "Screenshot of {url}",
  download: "Download",
  downloadPng: "Download as PNG",
  downloadJpeg: "Download as JPEG",

  // theme toggle
  themeDark: "Dark",
  themeLight: "Light",
  themeAria: "Toggle dark mode",

  // cross-language link (direction-dependent per rendered language)
  langBtnText: "한국어",
  langBtnHref: "/ko/",
  langBtnAria: "한국어로 보기",
  langBtnLang: "ko",
};

const KO: Dict = {
  lang: "ko",
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

  themeDark: "다크",
  themeLight: "라이트",
  themeAria: "다크 모드 전환",

  langBtnText: "English",
  langBtnHref: "/en/",
  langBtnAria: "View in English",
  langBtnLang: "en",
};

export const DICTS: Record<Lang, Dict> = { en: EN, ko: KO };

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ko";
}

/**
 * Look up a translated string for `lang`. Missing keys fall back to English,
 * then to the raw key — so a typo renders loudly as the key instead of blank.
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
