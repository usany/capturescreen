// src/routes/screenshot.route.ts
// Author: server-side-writer
// Created: 2026-07-26
//
// The core endpoint, in three parts:
//
//   POST /             capture synchronously, return the image inline as a
//                      base64 data URL AND cache the buffer under a job id
//   GET  /:id          the same record minus `image` — metadata only, so the
//                      client can poll without re-downloading a ~500KB string
//   GET  /:id/download the cached buffer verbatim, as an attachment
//
// The download serves the STORED bytes, never a re-encode: a user must
// download exactly the image they previewed, and the suite checks this by
// comparing lengths and leading bytes.

import express, { type Request, type Response, type Router } from "express";
import { Buffer } from "node:buffer";
import { mimeTypeFor } from "../config.ts";
import { AppError, ERROR_CODES } from "../lib/errors.ts";
import { buildFilename, sanitizeFilename } from "../lib/filename.ts";
import { validatedRequest, validateScreenshotRequest } from "../middleware/validate.middleware.ts";
import { capture } from "../services/screenshot.service.ts";
import { createJobId, getJob, isValidJobId, putJob } from "../services/job.store.ts";
import type { ScreenshotData } from "../types/api.ts";
import type { JobRecord } from "../types/server.ts";

/** Download responses may be cached briefly by the browser, never by a proxy. */
const DOWNLOAD_CACHE_CONTROL = "private, max-age=900";

/**
 * Look a job up or fail with the standard 404.
 *
 * A malformed id is treated as "not found" rather than "bad request": the id
 * space is opaque to callers, so distinguishing the two only leaks the format.
 */
function requireJob(rawId: string): JobRecord {
  const record = isValidJobId(rawId) ? getJob(rawId) : null;
  if (!record) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "That screenshot is no longer available. Capture it again.",
    );
  }
  return record;
}

export function createScreenshotRouter(): Router {
  const router = express.Router();

  // Validation is its own middleware so it provably runs before the handler —
  // and therefore before the browser is touched.
  router.post(
    "/",
    validateScreenshotRequest,
    async (_req: Request, res: Response) => {
      const opts = validatedRequest(res);

      const result = await capture(opts);
      const capturedAt = new Date();

      const id = createJobId();
      const filename = buildFilename(
        opts.url,
        opts.width,
        opts.height,
        opts.format,
        capturedAt,
      );
      const mimeType = mimeTypeFor(opts.format);
      const buffer = Buffer.from(result.buffer);

      // `meta` deliberately carries no `image` key, so GET /:id can serve this
      // object as-is and the field is genuinely absent rather than null.
      const meta: ScreenshotData = {
        id,
        url: opts.url,
        requestedUrl: opts.requestedUrl,
        width: result.width,
        height: result.height,
        format: opts.format,
        fullPage: opts.fullPage,
        quality: opts.quality,
        mimeType,
        bytes: buffer.length,
        downloadUrl: `/api/screenshot/${id}/download`,
        filename,
        capturedAt: capturedAt.toISOString(),
        durationMs: result.durationMs,
      };

      putJob({ id, buffer, meta, createdAt: capturedAt.getTime() });

      const data: ScreenshotData = {
        ...meta,
        image: `data:${mimeType};base64,${buffer.toString("base64")}`,
      };
      res.json({ ok: true, data });
    },
  );

  router.get("/:id", (req: Request, res: Response) => {
    const record = requireJob(req.params.id as string);
    res.json({ ok: true, data: record.meta });
  });

  router.get("/:id/download", (req: Request, res: Response) => {
    const record = requireJob(req.params.id as string);

    const override = req.query.filename;
    const filename = typeof override === "string" && override.length > 0
      ? sanitizeFilename(override)
      : record.meta.filename;

    const body = Buffer.from(record.buffer);

    res.setHeader("Content-Type", record.meta.mimeType);
    // `attachment` is what makes the browser download rather than render — and
    // therefore what makes Playwright's download event fire in the e2e suite.
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("Cache-Control", DOWNLOAD_CACHE_CONTROL);
    res.end(body);
  });

  return router;
}
