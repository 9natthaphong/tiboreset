import { expect, test, type Page } from "@playwright/test";

async function waitForPage(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
}

test("public layout remains contained at production target widths", async ({ page }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForPage(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "PLAN THE NEXT 36 HOURS" })).toBeVisible();
    await page.locator("[data-testid='advanced-diagnostics']").scrollIntoViewIfNeeded();
    await expect(page.locator(".model-summary")).toBeVisible();
  }
});

test("model record is expanded initially and keyboard-operable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPage(page);
  const details = page.locator("[data-testid='advanced-diagnostics']");
  const summary = details.locator(":scope > summary");
  await details.scrollIntoViewIfNeeded();
  await expect(details).toHaveAttribute("open", "");
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(summary).toContainText("COLLAPSE MODEL RECORD");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(summary).toContainText("OPEN FULL MODEL RECORD");
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(page.locator(".model-summary-ranking")).toBeVisible();
});

test("privacy and public navigation reveal no admin surface or fake visitor count", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPage(page);
  await expect(page.locator('a[href="/control-room"]')).toHaveCount(0);
  await expect(page.getByText("PAGE VIEWS THIS MONTH", { exact: true })).toHaveCount(0);
  await page.goto("/privacy", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anonymous site analytics" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
