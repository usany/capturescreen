// src/routes/health.route.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Liveness only. playwright.config.ts polls this URL to decide the server is
// up, so it must answer while chromium is still booting — note that nothing in
// this file imports the browser service. If health ever awaited a launch,
// every test run would stall for the full webServer timeout before starting.

import express, { type Request, type Response, type Router } from "express";
import type { HealthData } from "../types/api.ts";

const startedAt = Date.now();

export function createHealthRouter(): Router {
  const router = express.Router();

  router.get("/", (_req: Request, res: Response) => {
    const data: HealthData = { status: "ok", uptimeMs: Date.now() - startedAt };
    res.json({ ok: true, data });
  });

  return router;
}
