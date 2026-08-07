// src/lib/validators.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Input validation. Everything here is pure and synchronous on purpose: it runs
// in `validate.middleware.ts` BEFORE `getBrowser()` is ever awaited, so a bad
// request costs a JSON parse and nothing else (planner 7.2, tests B8).
//
// The governing rule, from _workspace/02_integration_tests.md B1: an ABSENT
// field falls back to its default; a PRESENT but invalid field is rejected.
// That is why every check below tests `=== undefined` rather than truthiness —
// `{ width: 0 }` and `{ format: "" }` are errors, not omissions.

import { allowPrivateHosts, DEFAULTS, LIMITS } from "../config.ts";
import { AppError, ERROR_CODES } from "./errors.ts";
import type { ImageFormat } from "../types/api.ts";
import type { NormalizedRequest, RawScreenshotBody } from "../types/server.ts";

/**
 * Does this string already carry a URL scheme?
 *
 * `localhost:3000` looks like `scheme:opaque` to a naive regex but is really a
 * host and port, so a colon followed only by digits does not count. Without
 * this, a bare `localhost:3000` would parse as protocol `localhost:` and be
 * rejected as INVALID_URL.
 */
function hasScheme(raw: string): boolean {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/s.exec(raw);
  if (!match) return false;
  const rest = match[2];
  return !/^\d+(?:[/?#].*)?$/s.test(rest);
}

/** RFC1918 / loopback / link-local detection for the optional SSRF guard. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || host.startsWith("fe80:")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;

  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Turn caller input into an absolute http(s) URL.
 *
 * Order matters and is asserted by the suite (B2): trim first, THEN test for
 * emptiness, THEN parse. `"   "` is a missing url, not an invalid one.
 */
export function normalizeUrl(raw: unknown): { url: string; requestedUrl: string } {
  if (typeof raw !== "string") {
    throw new AppError(ERROR_CODES.MISSING_URL, "A url is required.", { field: "url" });
  }

  const requestedUrl = raw.trim();
  if (requestedUrl.length === 0) {
    throw new AppError(ERROR_CODES.MISSING_URL, "A url is required.", { field: "url" });
  }

  const candidate = hasScheme(requestedUrl) ? requestedUrl : `https://${requestedUrl}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AppError(ERROR_CODES.INVALID_URL, "That does not look like a valid URL.", {
      field: "url",
      received: requestedUrl,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      ERROR_CODES.INVALID_URL,
      "Only http and https URLs can be captured.",
      { field: "url", received: parsed.protocol.replace(":", "") },
    );
  }

  if (parsed.hostname.length === 0) {
    throw new AppError(ERROR_CODES.INVALID_URL, "That URL is missing a hostname.", {
      field: "url",
      received: requestedUrl,
    });
  }

  if (!allowPrivateHosts() && isPrivateHost(parsed.hostname)) {
    throw new AppError(
      ERROR_CODES.BLOCKED_HOST,
      "Capturing private and loopback addresses is not permitted.",
      { field: "url", received: parsed.hostname },
    );
  }

  return { url: parsed.href, requestedUrl };
}

/** Validate one of width/height. Bounds are INCLUSIVE on both ends. */
export function validateDimension(
  value: unknown,
  field: "width" | "height",
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;

  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new AppError(
      ERROR_CODES.INVALID_DIMENSIONS,
      `${field} must be an integer between ${min} and ${max}.`,
      { field, received: value },
    );
  }
  return value;
}

/**
 * Resolve the output format.
 *
 * Matching is exact — no trimming, no case folding. `"PNG "` must fail (B1),
 * and once you accept `"PNG"` there is no principled line left to draw.
 */
export function validateFormat(value: unknown): ImageFormat {
  if (value === undefined) return DEFAULTS.format;

  if (value === "png") return "png";
  if (value === "jpeg" || value === "jpg") return "jpeg";

  throw new AppError(
    ERROR_CODES.INVALID_FORMAT,
    `format must be one of: ${LIMITS.formats.join(", ")}.`,
    { field: "format", received: value },
  );
}

/**
 * Validate quality, then decide whether it applies.
 *
 * The two steps are deliberately separate (B3): an out-of-range quality is a
 * 400 even for PNG, but a valid quality is discarded to `null` for PNG. So we
 * check the field on its own terms first and only then look at the format.
 */
export function validateQuality(value: unknown, format: ImageFormat): number | null {
  let quality: number = DEFAULTS.quality;

  if (value !== undefined) {
    if (
      typeof value !== "number" || !Number.isInteger(value) ||
      value < LIMITS.minQuality || value > LIMITS.maxQuality
    ) {
      throw new AppError(
        ERROR_CODES.INVALID_QUALITY,
        `quality must be an integer between ${LIMITS.minQuality} and ${LIMITS.maxQuality}.`,
        { field: "quality", received: value },
      );
    }
    quality = value;
  }

  return format === "png" ? null : quality;
}

export function validateTimeout(value: unknown): number {
  if (value === undefined) return DEFAULTS.timeoutMs;

  if (
    typeof value !== "number" || !Number.isInteger(value) ||
    value < LIMITS.minTimeoutMs || value > LIMITS.maxTimeoutMs
  ) {
    throw new AppError(
      ERROR_CODES.INVALID_TIMEOUT,
      `timeoutMs must be an integer between ${LIMITS.minTimeoutMs} and ${LIMITS.maxTimeoutMs}.`,
      { field: "timeoutMs", received: value },
    );
  }
  return value;
}

export function validateBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new AppError(ERROR_CODES.INVALID_BODY, `${field} must be true or false.`, {
      field,
      received: value,
    });
  }
  return value;
}

/** True only for a plain JSON object — arrays and null do not qualify. */
function isPlainObject(value: unknown): value is RawScreenshotBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Orchestrate the whole body into a `NormalizedRequest`.
 *
 * Field order fixes which error wins when several are bad at once: url first
 * (it is the only required field), then geometry, then encoding.
 */
export function parseScreenshotRequest(body: unknown): NormalizedRequest {
  if (!isPlainObject(body)) {
    throw new AppError(
      ERROR_CODES.INVALID_BODY,
      "Request body must be a JSON object.",
    );
  }

  const { url, requestedUrl } = normalizeUrl(body.url);
  const width = validateDimension(
    body.width,
    "width",
    DEFAULTS.width,
    LIMITS.minWidth,
    LIMITS.maxWidth,
  );
  const height = validateDimension(
    body.height,
    "height",
    DEFAULTS.height,
    LIMITS.minHeight,
    LIMITS.maxHeight,
  );
  const format = validateFormat(body.format);
  const quality = validateQuality(body.quality, format);
  const fullPage = validateBoolean(body.fullPage, "fullPage", DEFAULTS.fullPage);
  const timeoutMs = validateTimeout(body.timeoutMs);

  return { url, requestedUrl, width, height, format, quality, fullPage, timeoutMs };
}
