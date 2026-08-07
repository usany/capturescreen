// tests/integration/screenshot.capture.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// The core endpoint. The assertion that matters most here is NOT that the
// response echoes the width and height we asked for — a server can echo its
// own input while producing a wrongly sized image. We decode the returned PNG
// header and check the real pixel dimensions, which is the only proof the
// viewport was actually applied to the capture.
//
// Capture target is the app's own page (planner 8.1): always up, no network,
// and fast.

import { expect, test } from "@playwright/test";
import { buildBody, decodeDataUrl, expectOk, type ScreenshotData } from "../helpers/fixtures.ts";
import { detectFormat, getImageSize, MIN_PLAUSIBLE_SCREENSHOT_BYTES } from "../helpers/image.ts";
import { SERVER_DEFAULTS } from "../helpers/constants.ts";
import { type FixtureServer, startFixtureServer } from "../helpers/fixture-server.ts";

test.describe("POST /api/screenshot — capture", () => {
  test("captures at the requested viewport and returns a complete record", async ({ request, baseURL }) => {
    const res = await request.post("/api/screenshot", {
      data: buildBody(baseURL!, { width: 800, height: 600 }),
    });
    const data = await expectOk<ScreenshotData>(res);

    // Echoed effective values.
    expect(data.width).toBe(800);
    expect(data.height).toBe(600);
    expect(data.format).toBe("png");
    expect(data.mimeType).toBe("image/png");
    expect(data.fullPage).toBe(false);
    expect(data.quality).toBeNull();

    // The image itself.
    expect(data.image).toMatch(/^data:image\/png;base64,/);
    const { mimeType, bytes } = decodeDataUrl(data.image!);
    expect(mimeType).toBe("image/png");
    expect(detectFormat(bytes)).toBe("png");
    expect(bytes.length).toBeGreaterThan(MIN_PLAUSIBLE_SCREENSHOT_BYTES);

    // The part a naive implementation gets wrong.
    expect(getImageSize(bytes)).toEqual({ width: 800, height: 600 });

    // `bytes` must describe the real payload — the client renders "471 KB"
    // from it without decoding anything.
    expect(data.bytes).toBe(bytes.length);

    // Handles for the download flow.
    expect(data.id).toMatch(/^[0-9a-f]{12}$/);
    expect(data.downloadUrl).toBe(`/api/screenshot/${data.id}/download`);
    expect(data.filename).toMatch(/^screenshot-.*-800x600-.*\.png$/);

    // Telemetry the preview pane displays.
    expect(Number.isFinite(Date.parse(data.capturedAt))).toBe(true);
    expect(data.durationMs).toBeGreaterThan(0);
  });

  test("applies server defaults when width and height are omitted", async ({ request, baseURL }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", { data: buildBody(baseURL!) }),
    );

    expect(data.width).toBe(SERVER_DEFAULTS.width);
    expect(data.height).toBe(SERVER_DEFAULTS.height);
    expect(data.format).toBe(SERVER_DEFAULTS.format);
    expect(data.fullPage).toBe(SERVER_DEFAULTS.fullPage);

    const { bytes } = decodeDataUrl(data.image!);
    expect(getImageSize(bytes)).toEqual({
      width: SERVER_DEFAULTS.width,
      height: SERVER_DEFAULTS.height,
    });
  });

  test("normalizes a bare hostname to https and reports both forms", async ({ request }) => {
    // A bare host has to be auto-prefixed, and the response must distinguish
    // what the user typed (`requestedUrl`) from what was actually loaded
    // (`url`) — the preview alt text and filename derive from the latter.
    const res = await request.post("/api/screenshot", {
      data: buildBody("example.com", { width: 400, height: 300, timeoutMs: 20_000 }),
    });

    // Network access to a real host is not guaranteed in every environment;
    // what must hold is that normalization happened before navigation, so the
    // request is never rejected as INVALID_URL.
    const body = await res.json();
    if (body.ok) {
      expect(body.data.url).toBe("https://example.com/");
      expect(body.data.requestedUrl).toBe("example.com");
    } else {
      expect(body.error.code).not.toBe("INVALID_URL");
      expect(body.error.code).not.toBe("MISSING_URL");
      expect(["NAVIGATION_FAILED", "CAPTURE_TIMEOUT"]).toContain(body.error.code);
    }
  });

  test("honours non-default dimensions exactly", async ({ request, baseURL }) => {
    // 1980x1080 is the scenario the product spec calls out explicitly, and an
    // odd width is a good probe for off-by-one scaling bugs.
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 1980, height: 1080 }),
      }),
    );

    expect({ width: data.width, height: data.height }).toEqual({ width: 1980, height: 1080 });
    expect(getImageSize(decodeDataUrl(data.image!).bytes))
      .toEqual({ width: 1980, height: 1080 });
  });
});

test.describe("POST /api/screenshot — fullPage", () => {
  let fixture: FixtureServer;

  // A page taller than the viewport is required to tell the two modes apart.
  // The app's own page is short, so it cannot prove fullPage does anything.
  test.beforeAll(() => {
    fixture = startFixtureServer();
  });
  test.afterAll(async () => {
    await fixture?.close();
  });

  test("fullPage:false clips to the viewport height", async ({ request }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(fixture.url("/tall"), { width: 500, height: 400, fullPage: false }),
      }),
    );

    expect(getImageSize(decodeDataUrl(data.image!).bytes)).toEqual({ width: 500, height: 400 });
  });

  test("fullPage:true extends past the viewport to the document height", async ({ request }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(fixture.url("/tall"), { width: 500, height: 400, fullPage: true }),
      }),
    );

    expect(data.fullPage).toBe(true);

    const size = getImageSize(decodeDataUrl(data.image!).bytes);
    expect(size.width).toBe(500);
    // The fixture stacks three 1000px blocks; the capture must span all of
    // them rather than stopping at the 400px viewport.
    expect(size.height).toBeGreaterThan(400);
    expect(size.height).toBeGreaterThanOrEqual(3000);

    // The echoed `height` stays the viewport height per the contract — only
    // the captured image grows.
    expect(data.height).toBe(400);
  });
});
