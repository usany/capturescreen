// tests/integration/screenshot.download.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// The download route is what makes the browser's native save flow work, and
// it is the seam the e2e download spec depends on. Two properties carry the
// weight: the bytes served must be byte-identical to the bytes previewed (a
// re-encode here would mean the user downloads something different from what
// they saw), and Content-Disposition must be an attachment (otherwise Chrome
// renders the image inline and no download event ever fires).

import { expect, test } from "@playwright/test";
import {
  buildBody,
  decodeDataUrl,
  expectApiError,
  expectOk,
  filenameFromDisposition,
  type ScreenshotData,
} from "../helpers/fixtures.ts";
import { detectFormat, getImageSize } from "../helpers/image.ts";

/** Capture once and reuse the job across the assertions below. */
async function capture(
  request: import("@playwright/test").APIRequestContext,
  baseURL: string,
  overrides: Record<string, unknown> = {},
): Promise<ScreenshotData> {
  return await expectOk<ScreenshotData>(
    await request.post("/api/screenshot", {
      data: buildBody(baseURL, { width: 600, height: 400, ...overrides }),
    }),
  );
}

test.describe("GET /api/screenshot/:id", () => {
  test("returns metadata without the inline image", async ({ request, baseURL }) => {
    const created = await capture(request, baseURL!);

    const data = await expectOk<ScreenshotData>(
      await request.get(`/api/screenshot/${created.id}`),
    );

    expect(data.id).toBe(created.id);
    expect(data.width).toBe(created.width);
    expect(data.height).toBe(created.height);
    expect(data.bytes).toBe(created.bytes);
    expect(data.filename).toBe(created.filename);
    // The whole point of this route: no multi-hundred-KB base64 payload.
    expect(data.image).toBeUndefined();
  });

  test("unknown id returns 404 NOT_FOUND", async ({ request }) => {
    await expectApiError(
      await request.get("/api/screenshot/deadbeef1234"),
      404,
      "NOT_FOUND",
    );
  });
});

test.describe("GET /api/screenshot/:id/download", () => {
  test("serves the exact captured bytes as an attachment", async ({ request, baseURL }) => {
    const created = await capture(request, baseURL!);

    const res = await request.get(created.downloadUrl);
    expect(res.status()).toBe(200);

    const headers = res.headers();
    expect(headers["content-type"]).toContain("image/png");
    expect(headers["content-disposition"]).toContain("attachment");
    expect(filenameFromDisposition(headers["content-disposition"])).toBe(created.filename);
    expect(Number(headers["content-length"])).toBe(created.bytes);

    const body = await res.body();
    expect(body.length).toBe(created.bytes);
    expect(detectFormat(body)).toBe("png");
    expect(getImageSize(body)).toEqual({ width: 600, height: 400 });

    // Byte-for-byte identical to what the preview showed.
    const previewed = decodeDataUrl(created.image!).bytes;
    expect(body.length).toBe(previewed.length);
    expect(Array.from(body.slice(0, 64))).toEqual(Array.from(previewed.slice(0, 64)));
  });

  test("serves image/jpeg for a JPEG job", async ({ request, baseURL }) => {
    const created = await capture(request, baseURL!, { format: "jpeg", quality: 70 });

    const res = await request.get(created.downloadUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/jpeg");
    expect(detectFormat(await res.body())).toBe("jpeg");
  });

  test("honours a custom filename and sanitizes it", async ({ request, baseURL }) => {
    const created = await capture(request, baseURL!);

    const res = await request.get(
      `${created.downloadUrl}?filename=${encodeURIComponent("my report/../v2.png")}`,
    );
    expect(res.status()).toBe(200);

    const served = filenameFromDisposition(res.headers()["content-disposition"]);
    expect(served).toBeTruthy();
    // Path separators and traversal sequences must not survive into the
    // header — a browser would otherwise be asked to write outside Downloads.
    expect(served).not.toContain("/");
    expect(served).not.toContain("..");
    expect(served).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test("unknown id returns 404 NOT_FOUND as JSON", async ({ request }) => {
    const res = await request.get("/api/screenshot/000000000000/download");
    await expectApiError(res, 404, "NOT_FOUND");
    // Even on the binary route, errors stay JSON so the client can parse them.
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("rejects a malformed id rather than treating it as a path", async ({ request }) => {
    const res = await request.get("/api/screenshot/not-a-valid-id/download");
    expect([400, 404]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
