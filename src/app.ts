// src/app.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// `createApp()` builds the express app and nothing else — no `listen()`, no
// signal handlers, no side effects (planner A1). That separation is what lets
// a test import and boot it on an ephemeral port.
//
// Middleware order is the contract:
//   json body -> API routes -> static -> /api 404 -> error handler (LAST)
//
// API routes come before `express.static` so an unknown /api path can never be
// answered with index.html, and the error handler comes last so express.json()'s
// own SyntaxError is funnelled through it rather than rendered as HTML.

import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import { mountRoutes } from "./routes/index.ts";
import { createPageRouter } from "./routes/page.route.ts";
import { errorMiddleware } from "./middleware/error.middleware.ts";
import { notFoundMiddleware } from "./middleware/notFound.middleware.ts";

/** Resolved from this module, so the app runs from any working directory. */
export const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

export function createApp(): Express {
  const app = express();

  // Nothing here fingerprints usefully; it only helps an attacker.
  app.disable("x-powered-by");

  // A screenshot request is a few hundred bytes. The cap keeps a malformed or
  // hostile body from being buffered in full before it is rejected.
  app.use(express.json({ limit: "1mb" }));

  mountRoutes(app);

  // The page routes own `/`, `/en/`, `/ko/`. They come before `express.static`
  // so the page document is rendered per-language from the single template,
  // while static assets (js/css) still resolve from disk.
  app.use(createPageRouter());

  app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
