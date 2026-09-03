import { expect, test } from "@playwright/test";

test.describe("Theme and Language Toggles", () => {
  test("theme toggle switches between light and dark", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const themeBtn = page.getByTestId("theme-toggle");

    // Check initial state
    const initialDark = await html.evaluate((el) => el.classList.contains("dark"));

    // Click to toggle
    await themeBtn.click();
    await page.waitForTimeout(100);

    // Verify the state changed
    const newDark = await html.evaluate((el) => el.classList.contains("dark"));
    expect(newDark).not.toBe(initialDark);

    // Click again to toggle back
    await themeBtn.click();
    await page.waitForTimeout(100);

    // Verify it toggled back
    const finalDark = await html.evaluate((el) => el.classList.contains("dark"));
    expect(finalDark).toBe(initialDark);
  });

  test("lang toggle switches between en and ko", async ({ page }) => {
    await page.goto("/");

    const langBtn = page.getByTestId("lang-toggle");
    const langLabel = page.getByTestId("lang-label");

    // Get initial label (shows target language)
    const initialLabel = await langLabel.textContent();
    expect(initialLabel).toMatch(/^(EN|KO)$/);

    // Click to toggle
    await langBtn.click();
    await page.waitForTimeout(100);

    // Verify the label changed (now shows the new target language)
    const newLabel = await langLabel.textContent();
    expect(newLabel).not.toBe(initialLabel);
    expect(newLabel).toMatch(/^(EN|KO)$/);

    // Click again to toggle back
    await langBtn.click();
    await page.waitForTimeout(100);

    // Verify it toggled back
    const finalLabel = await langLabel.textContent();
    expect(finalLabel).toBe(initialLabel);
  });
});
