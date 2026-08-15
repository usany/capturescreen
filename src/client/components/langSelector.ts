/// <reference lib="dom" />
// src/client/components/langSelector.ts
// Author: agent
// Created: 2026-08-16
//
// `lang-btn` (added alongside the other header testids). Owning the language
// choice means owning three side effects that are otherwise easy to scatter:
//
//   1. the button's own label (it shows the *target* language, so the action is
//      self-describing — in English mode it reads "한국어"),
//   2. persistence of the choice to localStorage (urlshot:lang),
//   3. the document-level mirror of the choice: `<html lang>`, `<title>`, and
//      every statically-marked text node (`[data-i18n]`).
//
// Component-owned text (status banner, validation messages, preview alt) is
// *not* touched here — those components read `state.lang` in their own render
// passes, so they update themselves through the store. This component only
// writes the static markup and the document it belongs to.

import { $, on, setText } from "../dom.ts";
import { type Lang, LANG_STORAGE_KEY, otherLang, t } from "../i18n.ts";
import type { Store } from "../store.ts";

/** Persist the choice. Storage is a convenience, never a gate — swallow errors. */
function persist(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Storage full or unavailable — a fresh page just starts in English again.
  }
}

/**
 * Rewrite every element carrying a `data-i18n` marker. An element may declare:
 *   * `data-i18n="key"`            -> its textContent (default)
 *   * `data-i18n-attr="foo"`       -> set attribute `foo` (e.g. placeholder)
 *   * `data-i18n-title="key"`      -> its `title` attribute, as a separate key
 */
function applyStaticMarkup(root: ParentNode, lang: Lang): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;

    const viaAttr = el.dataset.i18nAttr;
    if (viaAttr) {
      el.setAttribute(viaAttr, t(lang, key));
    } else {
      setText(el, t(lang, key));
    }

    const titleKey = el.dataset.i18nTitle;
    if (titleKey) el.setAttribute("title", t(lang, titleKey));
  });
}

function renderButton(btn: HTMLButtonElement, lang: Lang): void {
  const target = otherLang(lang);
  setText(btn, t(target, "langSelfName"));
  btn.setAttribute("aria-label", t(lang, "switchTo", { lang: t(target, "langSelfName") }));
}

export function mountLangSelector(root: ParentNode, store: Store): void {
  const btn = $<HTMLButtonElement>("lang-btn", root);
  let current = store.getState().lang;

  const apply = (lang: Lang) => {
    document.documentElement.lang = lang;
    document.title = t(lang, "title");
    applyStaticMarkup(root, lang);
    renderButton(btn, lang);
  };

  apply(current);

  // All text-changing side effects hang off one store notification. `state.lang`
  // drives it; if some future code nudges `lang` programmatically we still
  // persist and re-render, so the button and the store can never disagree.
  store.subscribe((state) => {
    if (state.lang === current) return;
    current = state.lang;
    persist(current);
    apply(current);
  });

  on(btn, "click", () => {
    store.setState({ lang: otherLang(store.getState().lang) });
  });
}
