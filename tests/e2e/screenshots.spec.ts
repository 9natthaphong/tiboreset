import { expect, test, type Browser, type Page } from "@playwright/test";

async function waitForOracle(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
}

async function resetDemo(page: Page) {
  await page.request.post("/api/lab/reset-demo");
}

async function scrollToSection(page: Page, selector: string) {
  await page.locator(selector).evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 76, behavior: "instant" }));
}

async function captureLoading(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await resetDemo(page);
  await page.route("**/cinematic/tiboreset-hero.mp4", async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("CALIBRATING THE ORACLE")).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/cinematic-loading-1440x1000.png", caret: "initial" });
  await page.close();
}

test("capture cinematic editorial QA states", async ({ browser }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name !== "chromium");
  await captureLoading(browser);

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await resetDemo(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await page.screenshot({ path: "artifacts/screenshots/cinematic-opening-1440x1000.png" });

  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 5050); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "artifacts/screenshots/cinematic-final-hold-1440x1000.png" });

  await page.route("**/api/forecast/history", async route => {
    const response = await route.fetch();
    const json = await response.json() as { data?: unknown[] };
    await route.fulfill({ response, json: { ...json, data: json.data?.length ? [json.data.at(-1)] : [] } });
  });
  await expect(page.locator("main")).toHaveAttribute("data-refresh-ready", "true");
  const refreshedHistory = page.waitForResponse(response => response.url().includes("/api/forecast/history"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshedHistory;
  await expect(page.locator("[data-testid='sparse-forecast-state']")).toBeAttached({ timeout: 10_000 });
  await scrollToSection(page, "#forecast");
  await page.waitForTimeout(850);
  await page.screenshot({ path: "artifacts/screenshots/forecast-sparse-1440x1000.png" });
  await page.getByRole("tab", { name: "SIGNALS" }).click();
  await page.waitForTimeout(750);
  await page.screenshot({ path: "artifacts/screenshots/forecast-signals-1440x1000.png" });
  await page.getByRole("tab", { name: "RANGE" }).click();
  await page.waitForTimeout(750);
  await page.screenshot({ path: "artifacts/screenshots/forecast-range-1440x1000.png" });

  await scrollToSection(page, "#reset-history");
  await page.waitForTimeout(850);
  await page.screenshot({ path: "artifacts/screenshots/reset-history-editorial-1440x1000.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await resetDemo(mobile);
  await mobile.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(mobile);
  await mobile.screenshot({ path: "artifacts/screenshots/cinematic-mobile-opening-390x844.png" });
  await mobile.locator("#forecast").scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(850);
  await mobile.screenshot({ path: "artifacts/screenshots/cinematic-mobile-forecast-390x844.png" });
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await mobile.close();
});
