/// <reference lib="dom" />
// src/client/components/themeToggle.ts
// Author: agent
// Created: 2026-08-16
//
// `theme-btn` — a light/dark theme toggle in the page header (planner 4.2
// sibling of `lang-btn`).
//
// Dark mode is class-based: applying the `dark` class to <html> activates the
// `dark:` Tailwind variants compiled into tailwind.css (see
// src/styles/tailwind.input.css). The source of truth is the user's explicit
// choice, persisted in localStorage under `urlscreenshot:theme`; a first-time
// visitor falls back to their OS `prefers-color-scheme`.
//
// The button's label is the *target* theme (clicking "Dark" switches to dark),
// and it is refreshed here because — unlike every static string in the page —
// it flips at runtime and so cannot come only from the server-side dictionary.
//
// Theme is deliberately independent of the capture store: nothing about a
// screenshot depends on it, so it does not subscribe or write to AppState.

import { $, on, setText, win } from "../dom.ts";
import { getLang, t } from "../i18n.ts";

export type Theme = "light" | "dark";

const STORAGE_KEY = "urlscreenshot:theme";
const TARGET_KEY: Record<Theme, "themeDark" | "themeLight"> = {
  dark: "themeLight",
  light: "themeDark",
};

/** Read the persisted choice; null when unset or unreadable (private mode). */
function readStoredTheme(): Theme | null {
  try {
    const value = win.localStorage?.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

/** Default to the OS preference only when the user has not chosen explicitly. */
function preferredTheme(): Theme {
  return win.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function mountThemeToggle(root: ParentNode): void {
  const btn = $<HTMLButtonElement>("theme-btn", root);

  let theme: Theme = readStoredTheme() ?? preferredTheme();

  // Apply before first paint: module scripts run once the document is parsed,
  // and `start()` mounts this first for exactly this reason.
  document.documentElement.classList.toggle("dark", theme === "dark");

  const render = () => setText(btn, t(getLang(), TARGET_KEY[theme]));

  on(btn, "click", () => {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      win.localStorage?.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable — the in-memory toggle still applies.
    }
    render();
  });

  render();
}
