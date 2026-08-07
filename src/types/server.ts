// src/types/server.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Server-only types. These never reach the browser bundle, so unlike
// `./api.ts` they are free to describe things the client has no concept of:
// raw untrusted request bodies, decoded image buffers, live browser handles.

import type { ImageFormat, ScreenshotData } from "./api.ts";

/**
 * A POST /api/screenshot body straight off the wire.
 *
 * Every field is `unknown` on purpose: the whole job of `validators.ts` is to
 * turn this into a `NormalizedRequest`, and typing the input optimistically
 * would let an un-narrowed value slip through to Playwright.
 */
export interface RawScreenshotBody {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
  quality?: unknown;
  fullPage?: unknown;
  timeoutMs?: unknown;
}

/**
 * A fully validated request. Holding one of these means every field is
 * present, correctly typed, and within `LIMITS` — the capture service does no
 * further checking.
 */
export interface NormalizedRequest {
  /** Absolute URL to navigate to, e.g. `https://example.com/`. */
  url: string;
  /** Exactly what the caller typed, e.g. `example.com`. */
  requestedUrl: string;
  width: number;
  height: number;
  format: ImageFormat;
  /** Always null for PNG, even when the caller supplied a value. */
  quality: number | null;
  fullPage: boolean;
  timeoutMs: number;
}

/** Raw output of the capture service, before it becomes a `ScreenshotData`. */
export interface CaptureResult {
  buffer: Uint8Array;
  /** Effective viewport width. With fullPage the image is taller than `height`. */
  width: number;
  height: number;
  durationMs: number;
}

/** Live browser state. Readable before any launch has been attempted. */
export interface BrowserInfo {
  connected: boolean;
  name: string;
  version: string | null;
}

/**
 * A cached capture. `meta` is the metadata envelope payload minus `image`, so
 * GET /api/screenshot/:id can serve it directly and the download route can pair
 * `buffer` with the same filename and mime type.
 */
export interface JobRecord {
  id: string;
  buffer: Uint8Array;
  meta: ScreenshotData;
  createdAt: number;
}
