// src/lib/errors.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// One error type, one status map, one serializer. Routes throw `AppError` and
// never write an error body themselves — `error.middleware.ts` is the single
// funnel (planner 7.2). That is what keeps the envelope identical on the JSON
// routes and the binary download route alike.

import type { ApiErrorBody, ErrorCode } from "../types/api.ts";

export const ERROR_CODES = {
  MISSING_URL: "MISSING_URL",
  INVALID_URL: "INVALID_URL",
  INVALID_DIMENSIONS: "INVALID_DIMENSIONS",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_QUALITY: "INVALID_QUALITY",
  INVALID_TIMEOUT: "INVALID_TIMEOUT",
  INVALID_BODY: "INVALID_BODY",
  BLOCKED_HOST: "BLOCKED_HOST",
  NOT_FOUND: "NOT_FOUND",
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  BROWSER_UNAVAILABLE: "BROWSER_UNAVAILABLE",
  CAPTURE_TIMEOUT: "CAPTURE_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const satisfies Record<ErrorCode, ErrorCode>;

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  MISSING_URL: 400,
  INVALID_URL: 400,
  INVALID_DIMENSIONS: 400,
  INVALID_FORMAT: 400,
  INVALID_QUALITY: 400,
  INVALID_TIMEOUT: 400,
  INVALID_BODY: 400,
  BLOCKED_HOST: 403,
  NOT_FOUND: 404,
  NAVIGATION_FAILED: 502,
  BROWSER_UNAVAILABLE: 503,
  CAPTURE_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

/** Every deliberate failure in the app. Anything else is an INTERNAL_ERROR. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return httpStatusFor(this.code);
  }
}

export function httpStatusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Body-parser failures arrive as plain `Error`s carrying `status`/`type`
 * properties. They must not reach the client as express's default HTML page —
 * that leaks a stack trace and node_modules paths.
 */
function isBodyParserError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof e.type === "string" && e.type.startsWith("entity.")) return true;
  const status = e.status ?? e.statusCode;
  return err instanceof SyntaxError && typeof status === "number" && status === 400;
}

/** Normalize anything throwable into an `AppError`. */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (isBodyParserError(err)) {
    return new AppError(
      ERROR_CODES.INVALID_BODY,
      "Request body must be valid JSON describing a screenshot request.",
    );
  }

  // Deliberately generic: the real message and stack go to the log, never the
  // wire. An internal error message is the classic accidental disclosure.
  return new AppError(ERROR_CODES.INTERNAL_ERROR, "An unexpected server error occurred.");
}

/** Serialize to the failure half of the envelope. Never includes a stack. */
export function toEnvelope(err: unknown): { ok: false; error: ApiErrorBody } {
  const appError = toAppError(err);
  const error: ApiErrorBody = { code: appError.code, message: appError.message };
  if (appError.details !== undefined) error.details = appError.details;
  return { ok: false, error };
}
