/// <reference lib="dom" />
// src/client/api.ts
// Author: client-side-writer
// Created: 2026-07-26
//
// The only place in the client that speaks HTTP. Every response is the same
// envelope (planner 3), so unwrapping happens once here and the rest of the app
// deals in plain data or a thrown `ApiCallError`.
//
// A transport failure (server down, DNS, offline) is deliberately mapped onto
// the same `{ code, message }` shape as a server-side error. `preview-error`
// renders `error.message` verbatim, so it must never receive a raw
// `TypeError: Failed to fetch`.

import type {
  ApiEnvelope,
  ImageFormat,
  ScreenshotData,
  ScreenshotRequest,
  StatusData,
} from "../types/api.ts";

/** Error carrying the API's own code, so callers can branch without string matching. */
export class ApiCallError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiCallError";
    this.code = code;
    this.details = details;
  }
}

/** Coerce anything thrown in the client into the `{ code, message }` the store stores. */
export function toStoreError(err: unknown): { code: string; message: string } {
  if (err instanceof ApiCallError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: "INTERNAL_ERROR", message: err.message };
  return { code: "INTERNAL_ERROR", message: "Something went wrong." };
}

/** Parse a JSON envelope, unwrap `data`, or throw the error half. */
async function unwrap<T>(res: Response): Promise<T> {
  let body: ApiEnvelope<T>;
  try {
    body = await res.json() as ApiEnvelope<T>;
  } catch {
    throw new ApiCallError(
      "INTERNAL_ERROR",
      `The server returned a malformed response (HTTP ${res.status}).`,
    );
  }

  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new ApiCallError("INTERNAL_ERROR", "The server returned an unrecognised response.");
  }

  if (body.ok === false) {
    throw new ApiCallError(body.error.code, body.error.message, body.error.details);
  }
  return body.data;
}

/** What `capture()` hands to the API — `timeoutMs` is left to the server default. */
export interface CapturePayload {
  url: string;
  width: number;
  height: number;
  format: ImageFormat;
  /** Omitted entirely for PNG; the server reports `quality: null` there anyway. */
  quality?: number;
  fullPage: boolean;
}

/**
 * `POST /api/screenshot`. Resolves with the capture record (including the inline
 * data URL) or throws `ApiCallError`.
 *
 * The URL is sent as the user typed it, trimmed. Normalization of a bare host
 * (`example.com` -> `https://example.com/`) is the server's job, and the
 * response reports both forms — keeping one owner avoids the two sides
 * disagreeing about what was captured.
 */
export async function requestScreenshot(payload: CapturePayload): Promise<ScreenshotData> {
  const body: ScreenshotRequest = {
    url: payload.url,
    width: payload.width,
    height: payload.height,
    format: payload.format,
    fullPage: payload.fullPage,
  };
  if (payload.format === "jpeg") body.quality = payload.quality;

  let res: Response;
  try {
    res = await fetch("/api/screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiCallError("INTERNAL_ERROR", "Could not reach the screenshot service.");
  }
  return await unwrap<ScreenshotData>(res);
}

/** `GET /api/status`. Used once on load by the status banner. */
export async function fetchStatus(): Promise<StatusData> {
  let res: Response;
  try {
    res = await fetch("/api/status", { headers: { accept: "application/json" } });
  } catch {
    throw new ApiCallError("INTERNAL_ERROR", "Could not reach the screenshot service.");
  }
  return await unwrap<StatusData>(res);
}
