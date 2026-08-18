// src/routes/lang.route.ts
// Author: server-side-writer
// Created: 2026-08-19
//
// Top-of-domain language switches. `GET /en` / `GET /ko` persist the choice in
// a `lang` cookie (default path, NOT httpOnly — the client toggle reads and
// overwrites the same cookie) and redirect to `/`, which the client renders in
// that language from the cookie on boot.
//
// These are mounted in `app.ts` BEFORE `express.static`, so a `/en` request
// hits this router rather than being answered by a stray `en.html`.

import path from "node:path";
import express, { type Router } from "express";

/** Cookie name shared with the client (src/client/i18n.ts). */
export const LANG_COOKIE = "lang";

/** The supported languages. First is the fallback default. */
export const LANGS = ["en", "ko"] as const;
export type Lang = (typeof LANGS)[number];

/**
 * Direct language pages. `GET /en` / `GET /ko` persist the choice in a `lang`
 * cookie (default path, NOT httpOnly — the client toggle reads and overwrites
 * the same cookie) and serve the single `index.html`, which the client renders
 * in that language from the URL path + cookie. No redirect; the URL stays
 * `/en` or `/ko`.
 *
 * Only one HTML file is needed: every string reads off one dictionary in
 * src/client/i18n.ts, so two files would mean maintaining every button, label
 * and dark-mode class twice. These routes are mounted in `app.ts` BEFORE
 * `express.static`, so they own those paths rather than a stray en.html.
 */
export function createLangRouter(publicDir: string): Router {
  const router = express.Router();
  const indexHtml = path.join(publicDir, "index.html");

  for (const lang of LANGS) {
    router.get(`/${lang}`, (_req, res) => {
      res.cookie(LANG_COOKIE, lang, {
        path: "/",
        // "lax" keeps the choice when the user navigates back after following
        // a link from another site, without exposing it to every subrequest.
        sameSite: "lax",
        // Persist the choice; the client mirrors this value when it toggles.
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
      res.sendFile(indexHtml);
    });
  }

  return router;
}
