// src/lib/page.ts
// Author: agent
// Created: 2026-08-16
//
// Server-side page renderer. Reads the single template (src/views/page.html)
// once at load, then serves a fully-substituted HTML document per language.
//
// This is deliberately a tiny hand-rolled substitution engine rather than a
// template framework: the template has ~25 `{{key}}` placeholders and no
// control flow, so a single regex pass per rendered output is all it takes — no
// new dependency, and the "server-rendered, no-client-i18n" philosophy of the
// rest of the app is preserved.
//
// The rendered document is pre-translated static HTML (correct <html lang>,
// labels, aria, hrefs). The client only re-reads `<html lang>` for the handful
// of strings IT produces at runtime; nothing here touches the browser.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DICTS, type Lang } from "./i18n.ts";

export { DICTS, isLang, LANGS, t } from "./i18n.ts";
export type { Lang } from "./i18n.ts";

const TEMPLATE_URL = new URL("../views/page.html", import.meta.url);

/** `{{key}}` -> dictionary value. Unknown keys keep their raw token, so a
 * missing string is visible during development rather than erasing itself. */
function substitute(template: string, dict: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (token, key: string) => dict[key] ?? token);
}

// Cache the rendered document for each language across requests. The template
// never changes at runtime, so rendering per request would be pure repetition.
let cached: Record<Lang, string> | null = null;

/** Render the page in `lang` (cached after the first call per language). */
export async function getPage(lang: Lang): Promise<string> {
  if (cached === null) {
    const template = await readFile(fileURLToPath(TEMPLATE_URL), "utf8");
    cached = {
      en: substitute(template, DICTS.en),
      ko: substitute(template, DICTS.ko),
    };
  }
  return cached[lang];
}
