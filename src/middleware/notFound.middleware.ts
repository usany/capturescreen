// src/middleware/notFound.middleware.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Unmatched /api/* paths must answer with a JSON envelope, never index.html.
// Clients parse every /api response as JSON, so a static-middleware fallback
// that hands back HTML shows up as a confusing parse error rather than a 404.
//
// Non-API paths are deliberately left alone — those belong to the static
// handler and the single-page shell.

import type { NextFunction, Request, Response } from "express";
import { AppError, ERROR_CODES } from "../lib/errors.ts";

export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  // The requested path is deliberately not echoed back: it is attacker
  // controlled and ends up rendered in the client's error pane.
  next(new AppError(ERROR_CODES.NOT_FOUND, `No API route matches this ${req.method} request.`));
}
