// src/middleware/error.middleware.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// The single funnel every failure passes through — validation errors, capture
// errors, 404s, and express.json()'s own SyntaxError alike. Registering it LAST
// is what stops body-parser rendering its default HTML page complete with a
// stack trace and node_modules paths (B4).
//
// It must also keep working on the binary download route: errors there are
// still JSON, because the client parses them (B6).

import type { NextFunction, Request, Response } from "express";
import { toAppError, toEnvelope } from "../lib/errors.ts";
import { errorFields, log } from "../lib/logger.ts";

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // Express identifies an error handler by arity, so this parameter must
  // exist even though the response is always terminated here.
  _next: NextFunction,
): void {
  const appError = toAppError(err);

  const context = { method: req.method, path: req.path, code: appError.code };
  if (appError.status >= 500) {
    log.error("request.failed", { ...context, ...errorFields(err) });
  } else {
    log.warn("request.rejected", { ...context, message: appError.message });
  }

  // A capture that fails after headers went out (a streamed download, say)
  // cannot be turned into a JSON envelope — drop the socket instead of
  // corrupting the body with a second write.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(appError.status).json(toEnvelope(appError));
}
