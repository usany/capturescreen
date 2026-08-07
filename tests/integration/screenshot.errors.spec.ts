// tests/integration/screenshot.errors.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Runtime failures — the ones that happen after validation passes and the
// browser is already involved. These are the cases where a screenshot service
// leaks resources: every one of these paths must still close its
// BrowserContext, or the server degrades over a few dozen bad requests until
// captures start timing out for everyone.
//
// The last test in this file is the important one: it proves the server is
// still healthy after a burst of failures.

import { expect, test } from "@playwright/test";
import { buildBody, expectApiError, expectOk, type ScreenshotData } from "../helpers/fixtures.ts";
import { UNREACHABLE_URL } from "../helpers/constants.ts";
import { type FixtureServer, startFixtureServer } from "../helpers/fixture-server.ts";

test.describe("POST /api/screenshot — navigation failures", () => {
  test("connection refused maps to 502 NAVIGATION_FAILED", async ({ request }) => {
    // Port 9 (discard) on loopback: nothing listens, so chromium fails with
    // net::ERR_CONNECTION_REFUSED instantly. Deterministic and offline.
    const error = await expectApiError(
      await request.post("/api/screenshot", {
        data: buildBody(UNREACHABLE_URL, { width: 400, height: 300, timeoutMs: 10_000 }),
      }),
      502,
      "NAVIGATION_FAILED",
    );

    // The message is shown to the user in `preview-error`, so it must be
    // readable prose, not a raw chromium error constant.
    expect(error.message).not.toMatch(/^net::ERR_/);
  });

  test("unresolvable hostname maps to 502 NAVIGATION_FAILED", async ({ request }) => {
    // .invalid is reserved by RFC 2606 and can never resolve.
    await expectApiError(
      await request.post("/api/screenshot", {
        data: buildBody("http://this-host-cannot-exist.invalid", { timeoutMs: 15_000 }),
      }),
      502,
      "NAVIGATION_FAILED",
    );
  });

  test("an HTTP error page is still captured, not treated as a failure", async ({ request }) => {
    const fixture = startFixtureServer();
    try {
      // A 404 page is a legitimate thing to screenshot. Only transport-level
      // failures are errors — conflating the two would break capturing any
      // site that returns a non-200 for its landing page.
      const data = await expectOk<ScreenshotData>(
        await request.post("/api/screenshot", {
          data: buildBody(fixture.url("/status/404"), { width: 400, height: 300 }),
        }),
      );
      expect(data.bytes).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  });
});

test.describe("POST /api/screenshot — timeouts", () => {
  let fixture: FixtureServer;

  test.beforeAll(() => {
    fixture = startFixtureServer();
  });
  test.afterAll(async () => {
    await fixture?.close();
  });

  test("exceeding timeoutMs maps to 504 CAPTURE_TIMEOUT", async ({ request }) => {
    const started = Date.now();

    await expectApiError(
      await request.post("/api/screenshot", {
        // The fixture withholds response headers for 30s; we allow 2s.
        data: buildBody(fixture.url("/slow?ms=30000"), {
          width: 400,
          height: 300,
          timeoutMs: 2_000,
        }),
      }),
      504,
      "CAPTURE_TIMEOUT",
    );

    // The timeout must be honoured, not ignored in favour of the 30s default.
    // Generous upper bound so a slow CI box does not cause a false failure.
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  test("rejects an out-of-range timeoutMs at validation time", async ({ request }) => {
    for (const timeoutMs of [500, 60_001, -1, "soon"]) {
      const res = await request.post("/api/screenshot", {
        data: buildBody(UNREACHABLE_URL, { timeoutMs }),
      });
      await test.step(`timeoutMs ${JSON.stringify(timeoutMs)} is rejected`, async () => {
        expect(res.status()).toBe(400);
        expect((await res.json()).ok).toBe(false);
      });
    }
  });
});

test.describe("resource hygiene after failures", () => {
  test("server stays healthy after a burst of failed captures", async ({ request, baseURL }) => {
    // Each of these allocates a BrowserContext and then throws. If the service
    // does not close contexts in a finally block, the leak shows up here as a
    // degraded status or a failing capture.
    const failures = await Promise.all(
      Array.from({ length: 6 }, () =>
        request.post("/api/screenshot", {
          data: buildBody(UNREACHABLE_URL, { width: 320, height: 240, timeoutMs: 8_000 }),
        })),
    );
    for (const res of failures) {
      expect(res.status()).toBe(502);
    }

    // The real assertion: a normal capture still works afterwards.
    const data = await expectOk<ScreenshotData>(
      await request.post("/api/screenshot", {
        data: buildBody(baseURL!, { width: 400, height: 300 }),
      }),
    );
    expect(data.bytes).toBeGreaterThan(0);

    const status = await expectOk<{ status: string }>(await request.get("/api/status"));
    expect(status.status).toBe("ready");
  });
});
