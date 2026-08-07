// src/routes/status.route.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Readiness plus the exact defaults and limits the client seeds its inputs
// from. Two constraints worth stating out loud:
//
//   - Always HTTP 200. Readiness lives in the body; a 503 here would make the
//     client's status poll indistinguishable from the server being down.
//   - `defaults` has EXACTLY five keys. status.spec.ts compares with `toEqual`,
//     and the client iterates the object, so `timeoutMs` stays out of it.

import express, { type Request, type Response, type Router } from "express";
import { PUBLIC_DEFAULTS, PUBLIC_LIMITS } from "../config.ts";
import { getBrowserInfo, isBrowserDegraded, isBrowserReady } from "../services/browser.service.ts";
import { jobStats } from "../services/job.store.ts";
import type { ServiceStatus, StatusData } from "../types/api.ts";

const startedAt = Date.now();

function serviceStatus(): ServiceStatus {
  if (isBrowserReady()) return "ready";
  // Degraded means we tried and failed; before the first capture the browser
  // is simply not launched yet, which is "starting", not a fault.
  return isBrowserDegraded() ? "degraded" : "starting";
}

export function createStatusRouter(): Router {
  const router = express.Router();

  router.get("/", (_req: Request, res: Response) => {
    const data: StatusData = {
      status: serviceStatus(),
      browser: getBrowserInfo(),
      jobs: jobStats(),
      uptimeMs: Date.now() - startedAt,
      defaults: { ...PUBLIC_DEFAULTS },
      limits: { ...PUBLIC_LIMITS },
    };
    res.json({ ok: true, data });
  });

  return router;
}
