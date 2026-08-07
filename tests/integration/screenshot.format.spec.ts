// tests/integration/screenshot.format.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Format handling has three separable concerns, and a server can pass one
// while failing another:
//   1. the metadata says jpeg
//   2. the bytes actually ARE a jpeg  (checked via magic bytes, not mimeType)
//   3. `quality` genuinely reaches the encoder
// (3) is the one that silently regresses — dropping the quality option still
// produces a valid JPEG. We prove it by comparing encoded sizes across two
// quality levels.

import { expect, test } from "@playwright/test";
import { buildBody, decodeDataUrl, expectOk, type ScreenshotData } from "../helpers/fixtures.ts";
import { detectFormat, getImageSize } from "../helpers/image.ts";

test.describe("POST /api/screenshot — output formats", () => {
  test("produces a real JPEG when format is jpeg", async ({ request, baseURL }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 640, height: 480, format: "jpeg", quality: 80 }),
      }),
    );

    expect(data.format).toBe("jpeg");
    expect(data.mimeType).toBe("image/jpeg");
    expect(data.quality).toBe(80);
    expect(data.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(data.filename).toMatch(/\.jpe?g$/);

    const { bytes } = decodeDataUrl(data.image!);
    // Magic bytes, not the advertised content type — this is what catches a
    // server that relabels a PNG as JPEG.
    expect(detectFormat(bytes)).toBe("jpeg");
    expect(getImageSize(bytes)).toEqual({ width: 640, height: 480 });
  });

  test("accepts jpg as an alias and normalizes it to jpeg", async ({ request, baseURL }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 400, height: 300, format: "jpg" }),
      }),
    );

    expect(data.format).toBe("jpeg");
    expect(data.mimeType).toBe("image/jpeg");
    expect(detectFormat(decodeDataUrl(data.image!).bytes)).toBe("jpeg");
  });

  test("quality actually reaches the encoder", async ({ request, baseURL }) => {
    const capture = async (quality: number) => {
      const data = await expectOk<ScreenshotData>(
        await request.post("/api/screenshot", {
          data: buildBody(baseURL!, { width: 800, height: 600, format: "jpeg", quality }),
        }),
      );
      return data;
    };

    const low = await capture(15);
    const high = await capture(95);

    expect(low.quality).toBe(15);
    expect(high.quality).toBe(95);

    // Same page, same viewport, same encoder — the only variable is quality,
    // so the low-quality file must be meaningfully smaller. If the option is
    // being dropped, these come out identical.
    expect(low.bytes).toBeLessThan(high.bytes);
  });

  test("PNG requests report null quality and ignore any quality sent", async ({ request, baseURL }) => {
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        // quality is meaningless for PNG; the contract says silently ignore,
        // NOT reject.
        data: buildBody(baseURL!, { width: 400, height: 300, format: "png", quality: 40 }),
      }),
    );

    expect(data.format).toBe("png");
    expect(data.quality).toBeNull();
    expect(detectFormat(decodeDataUrl(data.image!).bytes)).toBe("png");
  });

  test("format drives the filename extension", async ({ request, baseURL }) => {
    const png = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 300, height: 300, format: "png" }),
      }),
    );
    const jpeg = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 300, height: 300, format: "jpeg" }),
      }),
    );

    expect(png.filename.endsWith(".png")).toBe(true);
    expect(jpeg.filename).toMatch(/\.jpe?g$/);
    // Distinct captures must not collide in the job store.
    expect(png.id).not.toBe(jpeg.id);
  });
});
