/// <reference lib="dom" />
// src/client/components/langToggle.ts
// Author: client-side-writer
// Created: 2026-08-19
//
// `lang-toggle`, `lang-label` (EN / KO).
//
// Mirrors the `/en` and `/ko` routes, client-side: a click persists the choice
// in the SAME `lang` cookie those routes set, then flips `state.lang`, whose
// change re-renders every subscriber (static text via `applyLanguage`, dynamic
// strings via their own `translate` calls).
//
// The button shows the *target* language code (consistent with the theme
// toggle's "show the target" rule): "KO" while English means a click switches
// to Korean. `aria-label` spells out the action for screen readers.

import { $, on, setData } from "../dom.ts";
import { applyLanguage, setPathLang, translate, writeCookieLang } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import type { Store } from "../store.ts";

export function mountLangToggle(root: ParentNode & Node, store: Store): void {
  const btn = $<HTMLButtonElement>("lang-toggle", root);
  const label = $("lang-label", root);

  const render = (lang: Lang) => {
    applyLanguage(lang, root);
    setData(btn, "lang", lang);
    const target: Lang = lang === "en" ? "ko" : "en";
    setData(btn, "target", target);
    const action = translate(lang, target === "ko" ? "lang.action.ko" : "lang.action.en");
    btn.setAttribute("aria-label", action);
    btn.title = action;
    if (label.textContent !== target.toUpperCase()) label.textContent = target.toUpperCase();
  };

  on(btn, "click", () => {
    const lang: Lang = store.getState().lang === "en" ? "ko" : "en";
    // Persist in the same cookie /en and /ko set, and move the URL to the
    // matching route so a reload (and the location bar) agree with the page.
    writeCookieLang(lang);
    setPathLang(lang);
    store.setState({ lang });
  });

  store.subscribe((state) => render(state.lang));
  render(store.getState().lang);
}
