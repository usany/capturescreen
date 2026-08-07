// tests/integration/status.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// GET /api/status is the contract handshake between server and client: the
// client seeds its input constraints from `limits` and its fallbacks from
// `defaults`. If these drift from the validator's real behaviour, the UI will
// happily let a user submit a request the server then rejects. These specs
// pin the payload, and screenshot.validation.spec.ts proves the validator
// actually enforces the same numbers.

import { expect, test } from "@playwright/test";
import { expectOk, type StatusData } from "../helpers/fixtures.ts";
import { LIMITS, SERVER_DEFAULTS } from "../helpers/constants.ts";

test.describe("GET /api/status", () => {
  test("advertises readiness, defaults and limits", async ({ request }) => {
    const res = await request.get("/api/status");
    const data = await expectOk<StatusData>(res);

    expect(["ready", "starting", "degraded"]).toContain(data.status);

    expect(data.defaults).toEqual({
      width: SERVER_DEFAULTS.width,
      height: SERVER_DEFAULTS.height,
      format: SERVER_DEFAULTS.format,
      quality: SERVER_DEFAULTS.quality,
      fullPage: SERVER_DEFAULTS.fullPage,
    });

    expect(data.limits).toEqual({
      minWidth: LIMITS.minWidth,
      maxWidth: LIMITS.maxWidth,
      minHeight: LIMITS.minHeight,
      maxHeight: LIMITS.maxHeight,
      minQuality: LIMITS.minQuality,
      maxQuality: LIMITS.maxQuality,
      navigationTimeoutMs: LIMITS.navigationTimeoutMs,
      formats: [...LIMITS.formats],
    });
  });

  test("reports browser and job-cache state", async ({ request }) => {
    const data = await expectOk<StatusData>(await request.get("/api/status"));

    expect(data.browser.name).toBe("chromium");
    expect(typeof data.browser.connected).toBe("boolean");

    expect(typeof data.jobs.cached).toBe("number");
    expect(data.jobs.cached).toBeGreaterThanOrEqual(0);
    expect(data.jobs.capacity).toBeGreaterThan(0);
    expect(data.jobs.cached).toBeLessThanOrEqual(data.jobs.capacity);
  });

  test("stays HTTP 200 regardless of browser state", async ({ request }) => {
    // Readiness is carried in the body, never the status code — a 503 here
    // would make the client's status poll indistinguishable from the server
    // being down, and would break the webServer readiness probe semantics.
    const res = await request.get("/api/status");
    expect(res.status()).toBe(200);
  });
});
