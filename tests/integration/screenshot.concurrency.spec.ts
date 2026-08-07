// tests/integration/screenshot.concurrency.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// One shared chromium instance serves every request (planner A4), so
// concurrency is where this architecture is most likely to break. The failure
// mode is specific and nasty: if the service reuses a page or mutates a shared
// viewport instead of creating a fresh BrowserContext per request, parallel
// captures at different sizes bleed into each other and each response looks
// individually plausible while carrying the wrong image.
//
// Requesting distinct dimensions per request and decoding every result is what
// makes that visible.

import { expect, test } from "@playwright/test";
import { buildBody, decodeDataUrl, expectOk, type ScreenshotData } from "../helpers/fixtures.ts";
import { detectFormat, getImageSize } from "../helpers/image.ts";

test.describe("POST /api/screenshot — concurrent requests", () => {
  test("parallel captures at different sizes do not bleed into each other", async ({ request, baseURL }) => {
    test.setTimeout(120_000);

    const sizes = [
      { width: 400, height: 300 },
      { width: 800, height: 600 },
      { width: 1024, height: 768 },
      { width: 640, height: 480 },
      { width: 1280, height: 720 },
    ];

    const results = await Promise.all(
      sizes.map(async (size) =>
        await expectOk<ScreenshotData>(
          await request.post("/api/screenshot", { data: buildBody(baseURL!, size) }),
        )
      ),
    );

    results.forEach((data, i) => {
      const expected = sizes[i];
      expect({ width: data.width, height: data.height }, `echoed size for request ${i}`)
        .toEqual(expected);
      expect(getImageSize(decodeDataUrl(data.image!).bytes), `pixel size for request ${i}`)
        .toEqual(expected);
    });

    // Every capture must land in the job store under its own id.
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("parallel captures in different formats stay isolated", async ({ request, baseURL }) => {
    test.setTimeout(120_000);

    const requested: Array<"png" | "jpeg"> = ["png", "jpeg", "png", "jpeg"];

    const results = await Promise.all(
      requested.map(async (format) =>
        await expectOk<ScreenshotData>(
          await request.post("/api/screenshot", {
            data: buildBody(baseURL!, { width: 500, height: 400, format }),
          }),
        )
      ),
    );

    results.forEach((data, i) => {
      expect(data.format, `format for request ${i}`).toBe(requested[i]);
      expect(detectFormat(decodeDataUrl(data.image!).bytes), `bytes for request ${i}`)
        .toBe(requested[i]);
    });
  });

  test("a failing capture does not disturb concurrent successful ones", async ({ request, baseURL }) => {
    test.setTimeout(120_000);

    // Interleave a guaranteed navigation failure with real captures. The
    // failure must not tear down the shared browser or poison its neighbours.
    const [good1, bad, good2] = await Promise.all([
      request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 420, height: 320 }),
      }),
      request.post("/api/screenshot", {
        data: buildBody("http://127.0.0.1:9", { width: 400, height: 300, timeoutMs: 10_000 }),
      }),
      request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 520, height: 420 }),
      }),
    ]);

    expect(bad.status()).toBe(502);

    const d1 = await expectOk<ScreenshotData>(good1);
    const d2 = await expectOk<ScreenshotData>(good2);
    expect(getImageSize(decodeDataUrl(d1.image!).bytes)).toEqual({ width: 420, height: 320 });
    expect(getImageSize(decodeDataUrl(d2.image!).bytes)).toEqual({ width: 520, height: 420 });
  });

  test("concurrent captures are all retrievable from the job store", async ({ request, baseURL }) => {
    test.setTimeout(120_000);

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        request.post("/api/screenshot", {
          data: buildBody(baseURL!, { width: 300 + i * 10, height: 300 }),
        }).then((res) => expectOk<ScreenshotData>(res))),
    );

    // Downloading them afterwards proves each buffer was stored under the id
    // that was handed back, rather than the last capture overwriting earlier
    // entries in a shared slot.
    for (const created of results) {
      const res = await request.get(created.downloadUrl);
      expect(res.status(), `download ${created.id}`).toBe(200);
      const body = await res.body();
      expect(body.length).toBe(created.bytes);
      expect(getImageSize(body).width).toBe(created.width);
    }
  });
});
