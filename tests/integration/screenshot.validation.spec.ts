// tests/integration/screenshot.validation.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Validation must reject before the browser is ever touched (planner 7.2).
// Two things are under test: the right code/status pair comes back, and it
// comes back *cheaply* — a 400 that costs a chromium launch is a denial of
// service waiting to happen.
//
// The boundary cases matter more than the obviously-bad ones: min and max are
// inclusive, so `width: 200` must PASS while `width: 199` must fail. Off-by-one
// bounds are the single most common validator bug.

import { expect, test } from "@playwright/test";
import { buildBody, expectApiError, expectOk, type ScreenshotData } from "../helpers/fixtures.ts";
import { LIMITS } from "../helpers/constants.ts";

test.describe("POST /api/screenshot — url validation", () => {
  test("rejects a missing, empty or non-string url", async ({ request }) => {
    const cases: Array<[string, unknown]> = [
      ["absent", undefined],
      ["empty string", ""],
      ["whitespace only", "   "],
      ["number", 42],
      ["null", null],
    ];

    for (const [label, url] of cases) {
      const body = url === undefined ? {} : { url };
      const res = await request.post("/api/screenshot", { data: body });
      await test.step(`url ${label} -> 400 MISSING_URL`, async () => {
        await expectApiError(res, 400, "MISSING_URL");
      });
    }
  });

  test("rejects non-http(s) protocols", async ({ request }) => {
    // javascript: and file: are the security-relevant ones — a screenshot
    // service that navigates to them is a local file disclosure primitive.
    for (const url of ["ftp://example.com", "javascript:alert(1)", "file:///etc/passwd", "://x"]) {
      const res = await request.post("/api/screenshot", { data: { url } });
      await test.step(`${url} -> 400 INVALID_URL`, async () => {
        await expectApiError(res, 400, "INVALID_URL");
      });
    }
  });

  test("names the offending field in error details", async ({ request }) => {
    const error = await expectApiError(
      await request.post("/api/screenshot", { data: buildBody("http://x.test", { width: 10 }) }),
      400,
      "INVALID_DIMENSIONS",
    );
    // The client renders inline errors next to the specific input, so it needs
    // to know which one failed.
    expect(error.details).toMatchObject({ field: "width" });
  });
});

test.describe("POST /api/screenshot — dimension validation", () => {
  const url = "http://127.0.0.1:9";

  test("rejects out-of-range and non-integer dimensions", async ({ request }) => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["width below min", { width: LIMITS.minWidth - 1 }],
      ["width above max", { width: LIMITS.maxWidth + 1 }],
      ["height below min", { height: LIMITS.minHeight - 1 }],
      ["height above max", { height: LIMITS.maxHeight + 1 }],
      ["fractional width", { width: 800.5 }],
      ["NaN width", { width: "not-a-number" }],
      ["negative height", { height: -100 }],
      ["zero width", { width: 0 }],
    ];

    for (const [label, overrides] of cases) {
      const res = await request.post("/api/screenshot", { data: buildBody(url, overrides) });
      await test.step(`${label} -> 400 INVALID_DIMENSIONS`, async () => {
        await expectApiError(res, 400, "INVALID_DIMENSIONS");
      });
    }
  });

  test("accepts the inclusive min and max bounds", async ({ request, baseURL }) => {
    // Only the minimum is captured for real — a 5000x20000 capture would be a
    // ~100M pixel image and is not worth the test time. What we need to know
    // is that the boundary is not rejected, so the max case asserts merely
    // that validation let it through.
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: LIMITS.minWidth, height: LIMITS.minHeight }),
      }),
    );
    expect({ width: data.width, height: data.height })
      .toEqual({ width: LIMITS.minWidth, height: LIMITS.minHeight });
  });

  test("does not reject the maximum bound as out of range", async ({ request }) => {
    const res = await request.post("/api/screenshot", {
      data: buildBody(url, { width: LIMITS.maxWidth, height: LIMITS.maxHeight }),
    });
    // The target is unreachable on purpose, so this fails at navigation, not
    // validation. Any INVALID_DIMENSIONS here means the bound is exclusive.
    const body = await res.json();
    expect(body.ok === true || body.error.code !== "INVALID_DIMENSIONS").toBe(true);
  });
});

test.describe("POST /api/screenshot — format, quality and body validation", () => {
  const url = "http://127.0.0.1:9";

  test("rejects unsupported formats", async ({ request }) => {
    for (const format of ["gif", "webp", "PNG ", "", 5]) {
      const res = await request.post("/api/screenshot", { data: buildBody(url, { format }) });
      await test.step(`format ${JSON.stringify(format)} -> 400 INVALID_FORMAT`, async () => {
        await expectApiError(res, 400, "INVALID_FORMAT");
      });
    }
  });

  test("rejects out-of-range quality", async ({ request }) => {
    for (const quality of [0, 101, 500, -1, 50.5, "high"]) {
      const res = await request.post("/api/screenshot", {
        data: buildBody(url, { format: "jpeg", quality }),
      });
      await test.step(`quality ${JSON.stringify(quality)} -> 400 INVALID_QUALITY`, async () => {
        await expectApiError(res, 400, "INVALID_QUALITY");
      });
    }
  });

  test("rejects a non-object body", async ({ request }) => {
    for (const payload of ['"just a string"', "[1,2,3]", "42", "null"]) {
      const res = await request.post("/api/screenshot", {
        headers: { "content-type": "application/json" },
        data: payload,
      });
      await test.step(`body ${payload} -> 400 INVALID_BODY`, async () => {
        await expectApiError(res, 400, "INVALID_BODY");
      });
    }
  });

  test("rejects malformed JSON without leaking a stack trace", async ({ request }) => {
    const res = await request.post("/api/screenshot", {
      headers: { "content-type": "application/json" },
      data: "{ this is not json",
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // express.json()'s SyntaxError must be funnelled through the error
    // middleware like everything else, not surfaced raw.
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:\d+|node_modules/);
  });

  test("validation failures are cheap — no browser work", async ({ request }) => {
    const started = Date.now();
    await expectApiError(
      await request.post("/api/screenshot", { data: {} }),
      400,
      "MISSING_URL",
    );
    // A rejected request must never reach chromium; even a warm capture takes
    // well over a second.
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
