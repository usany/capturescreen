// src/lib/filename.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// Download filenames. Two consumers: the generated default, and a caller
// supplied `?filename=` override. Both go through `sanitizeFilename`, because
// the value lands in a Content-Disposition header that a browser turns into a
// path on disk — `my report/../v2.png` must never survive intact (B7).

import type { ImageFormat } from "../types/api.ts";

/** File extension for a format. `jpeg` writes `.jpg`, the conventional suffix. */
export function extensionFor(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : "png";
}

/**
 * Reduce a name to `[A-Za-z0-9._-]` and neutralise traversal.
 *
 * Dots survive the character filter (extensions need them), so collapsing runs
 * of them is a separate step — otherwise `..` walks out of the download folder.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-]+/, "")
    .slice(0, 200);

  return cleaned.length > 0 ? cleaned : "screenshot.png";
}

/** `2026-07-26T02:37:00.123Z` -> `20260726T023700`. */
function compactTimestamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
}

/** Hostname as a filename-safe slug: `khusan.co.kr` -> `khusan-co-kr`. */
function hostSlug(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    host = "capture";
  }
  const slug = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 60) : "capture";
}

/** e.g. `screenshot-khusan-co-kr-1980x1080-20260726T023700.png`. */
export function buildFilename(
  url: string,
  width: number,
  height: number,
  format: ImageFormat,
  at: Date,
): string {
  const name = `screenshot-${hostSlug(url)}-${width}x${height}-${compactTimestamp(at)}.${
    extensionFor(format)
  }`;
  return sanitizeFilename(name);
}
