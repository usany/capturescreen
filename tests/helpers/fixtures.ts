// tests/helpers/fixtures.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Envelope assertions and request builders shared by every integration spec.
//
// Every endpoint in this API answers with the same envelope
// (_workspace/01_planner.md 3):
//   { ok: true,  data: T }
//   { ok: false, error: { code, message, details? } }
// Unwrapping it in one place means a spec body reads as intent
// ("this request is a 400 INVALID_FORMAT") instead of JSON plumbing.

import { expect } from "@playwright/test";
import type { APIResponse } from "@playwright/test";
import type { ErrorCode } from "./constants.ts";

/** `data` payload of a successful POST /api/screenshot (planner 3.3). */
export interface ScreenshotData {
  id: string;
  url: string;
  requestedUrl: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  fullPage: boolean;
  quality: number | null;
  mimeType: string;
  bytes: number;
  /** Absent on GET /api/screenshot/:id — that route returns metadata only. */
  image?: string;
  downloadUrl: string;
  filename: string;
  capturedAt: string;
  durationMs: number;
}

/** `data` payload of GET /api/status (planner 3.2). */
export interface StatusData {
  status: "ready" | "starting" | "degraded";
  browser: { connected: boolean; name: string; version: string | null };
  jobs: { cached: number; capacity: number };
  uptimeMs: number;
  defaults: Record<string, unknown>;
  limits: Record<string, unknown>;
}

export interface ScreenshotBody {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
  quality?: unknown;
  fullPage?: unknown;
  timeoutMs?: unknown;
}

/**
 * Build a request body. Only `url` is mandatory server-side, so overrides are
 * spread over a minimal base and undefined keys are dropped — that lets a spec
 * say "send no width at all" (to exercise defaults) rather than "send
 * width: undefined", which JSON.stringify would silently erase anyway but
 * which reads ambiguously in the test.
 */
export function buildBody(url: string, overrides: ScreenshotBody = {}): ScreenshotBody {
  const body: ScreenshotBody = { url, ...overrides };
  for (const key of Object.keys(body) as Array<keyof ScreenshotBody>) {
    if (body[key] === undefined) delete body[key];
  }
  return body;
}

/** Parse JSON, attaching the raw text to the failure when the body is not JSON. */
async function readJson(res: APIResponse): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Expected a JSON envelope but got non-JSON (HTTP ${res.status()}):\n${text.slice(0, 500)}`,
    );
  }
}

/**
 * Assert a 2xx success envelope and return its `data`.
 * The status is asserted alongside the body so a failure report shows both.
 */
export async function expectOk<T>(res: APIResponse, expectedStatus = 200): Promise<T> {
  const body = await readJson(res);
  expect(
    { status: res.status(), ok: body.ok, error: body.error },
    "expected a successful envelope",
  ).toMatchObject({ status: expectedStatus, ok: true });
  expect(body.data, "success envelope must carry a data object").toBeTruthy();
  return body.data as T;
}

/**
 * Assert a failure envelope with an exact HTTP status and error code.
 * Also enforces the shape rules the whole API relies on: `ok` is literally
 * false, `message` is a non-empty human string, and no `data` leaks out.
 */
export async function expectApiError(
  res: APIResponse,
  expectedStatus: number,
  expectedCode: ErrorCode,
): Promise<Record<string, unknown>> {
  const body = await readJson(res);
  const error = (body.error ?? {}) as Record<string, unknown>;

  expect(
    { status: res.status(), ok: body.ok, code: error.code },
    "expected a failure envelope",
  ).toEqual({ status: expectedStatus, ok: false, code: expectedCode });

  expect(typeof error.message, "error.message must be a string").toBe("string");
  expect((error.message as string).length, "error.message must not be empty")
    .toBeGreaterThan(0);
  expect(body.data, "failure envelope must not carry data").toBeUndefined();

  return error;
}

/**
 * Split a `data:<mime>;base64,<payload>` URL into its parts.
 *
 * The capture endpoint returns the image inline this way, so essentially every
 * pixel assertion in the suite starts here.
 */
export function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error(
      `Not a base64 data URL. Received: ${dataUrl.slice(0, 80)}${dataUrl.length > 80 ? "..." : ""}`,
    );
  }
  const [, mimeType, payload] = match;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mimeType, bytes };
}

/** Extract the `filename="..."` value from a Content-Disposition header. */
export function filenameFromDisposition(disposition: string | undefined): string | null {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : null;
}
