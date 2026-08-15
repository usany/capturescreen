// src/routes/page.route.ts
// Author: agent
// Created: 2026-08-16
//
// The HTML routes. Language is decided by the URL: `/en/` and `/ko/` serve the
// same template rendered in English and Korean respectively; `/` redirects to
// whichever the browser's Accept-Language header prefers.
//
// This mounts at the app root (not under /api), so it must be registered BEFORE
// `express.static` — see src/app.ts. Static assets (/js, /styles) still fall
// through to disk; only the page document itself is rendered.

import express, { type Request, type Response, type Router } from "express";
import { getPage } from "../lib/page.ts";
import type { Lang } from "../lib/i18n.ts";

export function createPageRouter(): Router {
  const router = express.Router();

  const serve = (lang: Lang) => (_req: Request, res: Response) => {
    void getPage(lang).then((html) => {
      res.set("content-type", "text/html; charset=utf-8");
      res.set("content-language", lang);
      res.send(html);
    });
  };

  // `/` has no page of its own — route by the browser's preferred language.
  // We only care whether Korean is preferred; everything else (or the default)
  // is served in English.
  router.get("/", (req: Request, res: Response) => {
    const acceptLanguage = String(req.headers["accept-language"] ?? "");
    res.redirect(302, /\bko\b/i.test(acceptLanguage) ? "/ko/" : "/en/");
  });

  // Express (non-strict routing) matches the trailing-slash form too, so the
  // browser's `/en/` and a raw `/en` both resolve.
  router.get(["/en", "/en/"], serve("en"));
  router.get(["/ko", "/ko/"], serve("ko"));

  return router;
}
