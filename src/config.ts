// src/config.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Every tunable value in one place. `DEFAULTS` and `LIMITS` are echoed verbatim
// by GET /api/status, and tests/helpers/constants.ts mirrors them — a change
// here is a change to the published contract.

import type { ImageFormat } from "./types/api.ts";

/** Applied when a request field is absent (planner 7.1). */
export const DEFAULTS = {
  width: 1280,
  height: 720,
  format: "png",
  quality: 90,
  fullPage: false,
  timeoutMs: 30_000,
} as const;

/** Validation bounds. Min and max are both INCLUSIVE. */
export const LIMITS = {
  minWidth: 200,
  maxWidth: 5_000,
  minHeight: 200,
  maxHeight: 20_000,
  minQuality: 1,
  maxQuality: 100,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  navigationTimeoutMs: DEFAULTS.timeoutMs,
  formats: ["png", "jpeg"] as ImageFormat[],
} as const;

/** In-memory capture cache sizing. */
export const JOB = {
  capacity: 50,
  ttlMs: 15 * 60_000,
} as const;

/**
 * The exact `defaults` object GET /api/status publishes.
 *
 * Deliberately NOT `DEFAULTS` itself: status.spec.ts compares with `toEqual`,
 * and the contract fixes this at five keys. `timeoutMs` is a server-side
 * concern the client never renders, so it stays out.
 */
export const PUBLIC_DEFAULTS = {
  width: DEFAULTS.width,
  height: DEFAULTS.height,
  format: DEFAULTS.format,
  quality: DEFAULTS.quality,
  fullPage: DEFAULTS.fullPage,
} as const;

/** The exact `limits` object GET /api/status publishes (eight keys). */
export const PUBLIC_LIMITS = {
  minWidth: LIMITS.minWidth,
  maxWidth: LIMITS.maxWidth,
  minHeight: LIMITS.minHeight,
  maxHeight: LIMITS.maxHeight,
  minQuality: LIMITS.minQuality,
  maxQuality: LIMITS.maxQuality,
  navigationTimeoutMs: LIMITS.navigationTimeoutMs,
  formats: [...LIMITS.formats],
} as const;

/** How long to let the network go quiet before capturing, at most. */
export const SETTLE = {
  networkIdleMs: 2_000,
  postLoadMs: 150,
} as const;

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    // No --allow-env: fall back to defaults rather than crashing at import time.
    return undefined;
  }
}

/** HTTP port. `PORT` env, else 3000. */
export function getPort(): number {
  const raw = env("PORT");
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : 3000;
}

/**
 * Whether private / loopback targets may be captured.
 *
 * Defaults to TRUE: the integration suite screenshots the app's own page on
 * 127.0.0.1, so an opt-out guard would 403 the entire suite. Set
 * ALLOW_PRIVATE_HOSTS=false for a public deployment to get the SSRF block.
 */
export function allowPrivateHosts(): boolean {
  return env("ALLOW_PRIVATE_HOSTS") !== "false";
}

/** MIME type for an output format. */
export function mimeTypeFor(format: ImageFormat): string {
  return format === "jpeg" ? "image/jpeg" : "image/png";
}
