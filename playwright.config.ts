// playwright.config.ts
// Author: integration-tester (per contract in _workspace/01_planner.md 2.2)
// Created: 2026-07-26

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(Deno.env.get("TEST_PORT") ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },

  // The server keeps ONE shared chromium instance. Running specs in parallel
  // would multiply concurrent captures across workers and make timing-sensitive
  // assertions (durationMs, CAPTURE_TIMEOUT) flaky. Concurrency is instead
  // exercised deliberately inside screenshot.concurrency.spec.ts.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!Deno.env.get("CI"),
  retries: Deno.env.get("CI") ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    extraHTTPHeaders: { accept: "application/json" },
  },

  projects: [
    // API-level. Uses the `request` fixture only — never launches a browser.
    { name: "integration", testDir: "./tests/integration" },
    // UI-level, owned by qa-tester.
    { name: "e2e", testDir: "./tests/e2e", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "deno task build && deno task start",
    url: `${BASE_URL}/api/health`,
    env: { PORT: String(PORT), NODE_ENV: "test", ALLOW_PRIVATE_HOSTS: "true" },
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
