// src/middleware/validate.middleware.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Runs BEFORE the route handler, and therefore before `getBrowser()` is ever
// awaited. That ordering is the whole point: a 400 must cost nothing but a
// JSON parse and must return in well under a second (B8). A router that awaits
// the browser first fails that test even though every code path is "correct".

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { parseScreenshotRequest } from "../lib/validators.ts";
import type { NormalizedRequest } from "../types/server.ts";

/** Key under which the validated request is handed to the route. */
export const VALIDATED = "screenshotRequest";

/** Read the validated request a route was given. Throws if used unguarded. */
export function validatedRequest(res: Response): NormalizedRequest {
  const value = res.locals[VALIDATED] as NormalizedRequest | undefined;
  if (!value) {
    throw new Error("validateScreenshotRequest must run before this handler");
  }
  return value;
}

export const validateScreenshotRequest: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    res.locals[VALIDATED] = parseScreenshotRequest(req.body);
    next();
  } catch (err) {
    // Every AppError goes to the one funnel; no route writes an error body.
    next(err);
  }
};
