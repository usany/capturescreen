// src/types/api.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// The single shared API contract, imported by BOTH the express server and the
// browser bundle (planner 01, decision A7). Nothing runtime-specific may live
// here: no `express`, no `playwright`, no DOM. It is types only, so the file is
// safe to pull into `deno bundle --platform=browser`.
//
// Mirrors _workspace/01_planner.md 3 exactly. If the server needs a field the
// client does not know about, add it here first.

/** Image encodings the capture endpoint accepts. `"jpg"` is normalized to `"jpeg"` server-side. */
export type ImageFormat = "png" | "jpeg";

/** Every failure code the API can emit (planner 3.3). */
export const ERROR_CODES = [
  "MISSING_URL",
  "INVALID_URL",
  "INVALID_DIMENSIONS",
  "INVALID_FORMAT",
  "INVALID_QUALITY",
  // Additive: `timeoutMs` is validated on its own terms and needs a code of its
  // own. Not in planner 3.3's table; see _workspace/03_server-side-writer.md.
  "INVALID_TIMEOUT",
  "INVALID_BODY",
  "BLOCKED_HOST",
  "NOT_FOUND",
  "NAVIGATION_FAILED",
  "BROWSER_UNAVAILABLE",
  "CAPTURE_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

/** The error half of the envelope. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * The one and only response shape. No endpoint ever returns a bare object,
 * which is why the client can unwrap in a single place (`src/client/api.ts`).
 */
export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody };

/** Body accepted by `POST /api/screenshot`. Only `url` is required. */
export interface ScreenshotRequest {
  url: string;
  width?: number;
  height?: number;
  format?: ImageFormat;
  quality?: number;
  fullPage?: boolean;
  timeoutMs?: number;
}

/** `data` of a successful `POST /api/screenshot` (planner 3.3). */
export interface ScreenshotData {
  id: string;
  /** The URL actually navigated to, after normalization. */
  url: string;
  /** Exactly what the caller sent, before normalization. */
  requestedUrl: string;
  /** Effective viewport width applied to the capture. */
  width: number;
  /** Effective viewport height. With `fullPage` the image is taller than this. */
  height: number;
  format: ImageFormat;
  fullPage: boolean;
  /** `null` for PNG — quality is a JPEG-only concept. */
  quality: number | null;
  mimeType: string;
  /** True byte length of the encoded image; the preview meta renders KB from it. */
  bytes: number;
  /** `data:<mime>;base64,...`. Absent on `GET /api/screenshot/:id` (metadata only). */
  image?: string;
  downloadUrl: string;
  filename: string;
  capturedAt: string;
  durationMs: number;
}

/** Readiness of the capture pipeline. HTTP stays 200 for all three. */
export type ServiceStatus = "ready" | "starting" | "degraded";

/** `data` of `GET /api/status` (planner 3.2). */
export interface StatusData {
  status: ServiceStatus;
  browser: { connected: boolean; name: string; version: string | null };
  jobs: { cached: number; capacity: number };
  uptimeMs: number;
  defaults: {
    width: number;
    height: number;
    format: ImageFormat;
    quality: number;
    fullPage: boolean;
  };
  limits: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    minQuality: number;
    maxQuality: number;
    navigationTimeoutMs: number;
    formats: readonly ImageFormat[];
  };
}

/** `data` of `GET /api/health` — liveness only, answers while chromium boots. */
export interface HealthData {
  status: "ok";
  uptimeMs: number;
}
