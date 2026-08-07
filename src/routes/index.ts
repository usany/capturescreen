// src/routes/index.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Mount point for every API route. Kept separate from `app.ts` so the
// middleware pipeline and the route table can be read independently.

import type { Express } from "express";
import { createHealthRouter } from "./health.route.ts";
import { createStatusRouter } from "./status.route.ts";
import { createScreenshotRouter } from "./screenshot.route.ts";

/** API routes are mounted before the static handler so /api never hits disk. */
export function mountRoutes(app: Express): void {
  app.use("/api/health", createHealthRouter());
  app.use("/api/status", createStatusRouter());
  app.use("/api/screenshot", createScreenshotRouter());
}
