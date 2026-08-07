// tests/integration/health.spec.ts
// Author: integration-tester
// Created: 2026-07-26
//
// GET /api/health is what playwright.config.ts polls to decide the server is
// up, so it has one hard requirement beyond returning 200: it must answer
// while chromium is still booting. If health ever waits on the browser, every
// test run stalls for the full webServer timeout instead of starting.

import { expect, test } from "@playwright/test";
import { expectOk } from "../helpers/fixtures.ts";

interface HealthData {
  status: string;
  uptimeMs: number;
}

test.describe("GET /api/health", () => {
  test("reports liveness in the standard envelope", async ({ request }) => {
    const res = await request.get("/api/health");
    const data = await expectOk<HealthData>(res);

    expect(data.status).toBe("ok");
    expect(typeof data.uptimeMs).toBe("number");
    expect(data.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  test("responds fast and without touching the browser", async ({ request }) => {
    // A health check that lazily launches chromium would take ~700ms+ on the
    // first hit. Two back-to-back calls both staying well under that is the
    // cheapest signal that the route is genuinely independent of the browser.
    for (let i = 0; i < 2; i++) {
      const started = Date.now();
      const res = await request.get("/api/health");
      expect(res.status()).toBe(200);
      expect(Date.now() - started).toBeLessThan(1_000);
    }
  });

  test("unmatched /api routes return a 404 envelope, not HTML", async ({ request }) => {
    // The static middleware must not swallow unknown API paths and hand back
    // index.html — clients parse these as JSON.
    const res = await request.get("/api/definitely-not-a-route");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");

    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
