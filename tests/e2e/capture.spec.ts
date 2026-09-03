import { expect, test } from "@playwright/test";
import { enterUrl, expectCaptureSucceeded, settle, ui } from "../helpers/ui.ts";

test.describe("Capture Button", () => {
  test("capture button is visible and clickable", async ({ page }) => {
    await page.goto("/");

    const { captureBtn } = ui(page);

    // Capture button should exist
    await expect(captureBtn).toBeVisible();

    // Initially disabled (no URL)
    await expect(captureBtn).toBeDisabled();
  });

  test("capture button enables when URL is entered", async ({ page }) => {
    await page.goto("/");

    const { captureBtn } = ui(page);

    // Enter a valid URL
    await enterUrl(page, "https://example.com");

    // Button should be enabled
    await expect(captureBtn).toBeEnabled();
  });

  test("capture button triggers a capture", async ({ page }) => {
    test.setTimeout(120_000); // Allow 2 minutes for this test
    await page.goto("/");

    // Enter URL and wait for button to enable
    await enterUrl(page, "https://example.com");

    const { captureBtn } = ui(page);

    // Click the capture button
    await captureBtn.click();

    // Wait for capture to complete
    await expectCaptureSucceeded(page);
  });

  test("capture button is disabled while loading", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");

    const { captureBtn } = ui(page);
    await enterUrl(page, "https://example.com");

    // Start capture
    await captureBtn.click();

    // Button should be disabled while loading
    await expect(captureBtn).toHaveAttribute("aria-busy", "true");

    // Wait for completion
    await settle(page);

    // After completion, button should be enabled again
    await expect(captureBtn).not.toHaveAttribute("aria-busy", "true");
  });
});
