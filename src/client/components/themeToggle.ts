/// <reference lib="dom" />
// src/client/components/themeToggle.ts
// Author: client-side-writer
// Created: 2026-08-19
//
// `theme-toggle`, `theme-label` (light/dark).
//
// One page-level side effect and one data dependency, both in one place:
//
//   * The effect — toggling the `dark` class on `<html>`. Tailwind v4's default
//     `dark:` variant follows `prefers-color-scheme`; this app opts into
//     class-based dark mode, so the root needs an explicit marker for a toggle
//     to be meaningful at all. `@custom-variant dark` in the stylesheet is what
//     makes `dark:*` utilities respond to that class.
//
//   * The data — `state.theme`, persisted under `urlshot:theme` so a reload
//     keeps the user's choice (the same "localStorage wins, but never gates"
//     policy as sizeControls, §4 of 04_client-side-writer.md).
//
// The button shows the *target* scheme, not the current one: a moon / "Dark mode"
// means a click switches to dark. `aria-pressed` reflects the ACTUAL state, so a
// screen reader can tell light from dark. Icon, prose and `aria-label` always
// agree, because they all read off `OPPOSITE[theme]` in the same render pass.

import { $, on, setData, win } from "../dom.ts";
import type { Store, Theme } from "../store.ts";

export const THEME_STORAGE_KEY = "urlshot:theme";

/** The theme a click on the current scheme produces. */
const OPPOSITE: Record<Theme, Theme> = { light: "dark", dark: "light" };

/** Display prose for a theme, as shown when that theme is the *target*. */
const MODE_LABEL: Record<Theme, string> = { dark: "Dark mode", light: "Light mode" };

interface ThemeMediaQuery {
  matches?: boolean;
}

/** Remembered choice, else null. Swallowed so blocking storage can't break boot. */
function readStoredTheme(): Theme | null {
  try {
    const value = win.localStorage?.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    win.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage full or unavailable — persistence is a convenience, never a gate.
  }
}

/** The theme the app boots with: a remembered choice if there is one, else the OS. */
export function getInitialTheme(): Theme {
  const remembered = readStoredTheme();
  if (remembered) return remembered;
  const media = win.matchMedia as unknown as ((q: string) => ThemeMediaQuery) | undefined;
  return media?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Flip the whole page: `dark` class + `color-scheme` on `<html>`. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function mountThemeToggle(root: ParentNode, store: Store): void {
  const btn = $<HTMLButtonElement>("theme-toggle", root);
  const sun = $("theme-icon-sun", root);
  const moon = $("theme-icon-moon", root);
  const label = $("theme-label", root);

  const setPartHidden = (part: Element, hidden: boolean) => {
    if (part instanceof HTMLElement) part.hidden = hidden;
  };

  // `setTheme` is the single write path (click and store share it) so the DOM
  // can never drift from what was persisted.
  const setTheme = (theme: Theme) => {
    applyTheme(theme);
    writeStoredTheme(theme);
    store.setState({ theme });
  };

  const render = (theme: Theme) => {
    applyTheme(theme);
    setData(btn, "theme", theme);
    setData(btn, "target", OPPOSITE[theme]);
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    // Icon + prose both describe the scheme a click produces.
    const target = OPPOSITE[theme];
    setPartHidden(sun, target !== "light");
    setPartHidden(moon, target !== "dark");
    const action = `Switch to ${target} mode`;
    btn.setAttribute("aria-label", action);
    btn.title = action;
    if (label.textContent !== MODE_LABEL[target]) label.textContent = MODE_LABEL[target];
  };

  on(btn, "click", () => {
    setTheme(OPPOSITE[store.getState().theme]);
  });

  store.subscribe((state) => render(state.theme));
  render(store.getState().theme);
}
