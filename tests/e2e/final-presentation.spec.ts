import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1728, height: 900 },
  { width: 1920, height: 1080 },
];

const scoreFixtures = [0, 3, 9, 10, 92, 95, 100];
const zoomFactors = [0.9, 1, 1.1, 1.25];

type Rect = { x: number; y: number; width: number; height: number };

async function box(locator: Locator, label: string): Promise<Rect> {
  await expect(locator, label).toBeVisible();
  const value = await locator.boundingBox();
  expect(value, `${label} has a bounding box`).not.toBeNull();
  return value!;
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
}

function contained(inner: Rect, outer: Rect) {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
}

async function waitForRevealedHero(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-hold", "true");
  await page.evaluate(() => document.fonts.ready);
}

async function expectMetricLayout(page: Page, label: string) {
  const region = await box(page.locator(".hero-story-probability"), `${label} metric region`);
  const value = await box(page.getByTestId("hero-watch-value"), `${label} watch value`);
  const score = await box(page.getByTestId("hero-watch-score"), `${label} watch score`);
  const denominator = await box(page.getByTestId("hero-watch-denominator"), `${label} denominator`);
  const policy = await box(page.getByTestId("hero-policy-row"), `${label} policy row`);
  const calibrated = await box(page.getByTestId("hero-calibrated-row"), `${label} calibrated row`);
  const viewport = page.viewportSize()!;

  expect(overlaps(score, denominator), `${label}: score and denominator intersect`).toBe(false);
  expect(contained(score, value), `${label}: score is outside its reserved value area; score=${JSON.stringify(score)} value=${JSON.stringify(value)}`).toBe(true);
  expect(contained(denominator, value), `${label}: denominator is outside its reserved value area; denominator=${JSON.stringify(denominator)} value=${JSON.stringify(value)}`).toBe(true);
  expect(contained(value, region), `${label}: value is outside the Hero metric region; value=${JSON.stringify(value)} region=${JSON.stringify(region)}`).toBe(true);
  expect(overlaps(value, policy), `${label}: policy row intersects the primary value`).toBe(false);
  expect(overlaps(policy, calibrated), `${label}: calibrated row intersects the policy row`).toBe(false);
  expect(region.x).toBeGreaterThanOrEqual(-1);
  expect(region.x + region.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: document overflows horizontally`).toBe(true);
}

test("the fully revealed Watch Score metric remains collision-free for every score and target viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The presentation matrix runs once in Chromium.");
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const consoleErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForRevealedHero(page);

    for (const score of scoreFixtures) {
      await page.getByTestId("hero-watch-score").evaluate((element, value) => {
        element.textContent = String(value);
      }, score);
      await expectMetricLayout(page, `${score} at ${viewport.width}×${viewport.height}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForRevealedHero(page);
  await page.getByTestId("hero-watch-score").evaluate(element => { element.textContent = "92"; });
  for (const zoom of zoomFactors) {
    await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
    await expectMetricLayout(page, `92 at ${Math.round(zoom * 100)}% zoom equivalent`);
  }
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  expect(consoleErrors).toEqual([]);
});

test("Historical Memory labels similarity and evaluation status without implying probability", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The focused archive check runs once.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForRevealedHero(page);

  await page.locator(".research-archive").evaluate((element: HTMLDetailsElement) => { element.open = true; });
  const historicalMemory = page.getByTestId("historical-memory");
  await historicalMemory.scrollIntoViewIfNeeded();
  await expect(historicalMemory).toContainText("Similarity compares feature patterns with verified historical windows.");
  await expect(historicalMemory).toContainText("not a probability and not part of the final forecast calculation");

  const cards = page.getByTestId("historical-analog");
  await expect(cards).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const card = cards.nth(index);
    await expect(card.getByText("SIMILARITY MATCH", { exact: true })).toBeVisible();
    await expect(card.getByText("Not a probability", { exact: true })).toBeVisible();
    await expect(card.locator(".memory-similarity strong")).not.toContainText("%");
    await expect(card.getByText("Event type", { exact: true })).toBeVisible();
    await expect(card.getByText("Historical timestamp", { exact: true })).toBeVisible();
    await expect(card.getByText("Source excerpt", { exact: true })).toBeVisible();
    await expect(card.locator("time")).toHaveAttribute("dateTime", /\d{4}-\d{2}-\d{2}/);
    await expect(card.locator("time")).toContainText("UTC");
    const cardBox = await box(card, `historical card ${index + 1}`);
    expect(cardBox.x).toBeGreaterThanOrEqual(-1);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(361);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
