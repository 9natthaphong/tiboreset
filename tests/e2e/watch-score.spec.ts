import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function waitForHero(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
}

test("Watch Score remains contained and agrees with the canonical API and Data Lab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run the focused viewport matrix once.");
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const consoleErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHero(page);

    await expect(page.getByText("RESET WATCH SCORE", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("An operational readiness score, not a probability.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/CALIBRATED NEXT-36H PROBABILITY/).first()).toBeVisible();
    const score = page.getByTestId("hero-watch-score");
    const scoreBox = await score.boundingBox();
    expect(scoreBox).not.toBeNull();
    expect(scoreBox!.x).toBeGreaterThanOrEqual(-1);
    expect(scoreBox!.x + scoreBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const response = await page.request.get("/api/hybrid/current");
  expect(response.ok()).toBe(true);
  const canonical = await response.json() as { hybrid: { watchScore: number }; forecast: { probability: number } };
  await page.setViewportSize(viewports[1]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHero(page);
  await expect(page.getByTestId("hero-watch-score")).toContainText(String(canonical.hybrid.watchScore));
  await expect(page.getByTestId("hero-calibrated-probability")).toHaveText(`${Math.round(canonical.forecast.probability * 100)}%`);

  await page.goto("/lab/data", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("data-lab-canonical-score")).toContainText(`WATCH ${canonical.hybrid.watchScore} / 100`);
  await expect(page.getByTestId("data-lab-canonical-score")).toContainText(`CALIBRATED NEXT-36H ${Math.round(canonical.forecast.probability * 100)}%`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});
