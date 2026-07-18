import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
}

async function waitForHero(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
}

test("the resolved event and active-cycle score own non-overlapping hero areas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The target viewport matrix runs once.");
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHero(page);

    const hero = page.locator(".cinematic-hero");
    const title = page.locator(".hero-story-title");
    const event = page.locator(".hero-event-status");
    const score = page.locator(".hero-story-probability");
    const callToAction = page.locator(".hero-story-payoff a");
    const [heroBox, titleBox, eventBox, scoreBox, ctaBox] = await Promise.all([box(hero), box(title), box(event), box(score), box(callToAction)]);

    for (const [name, value] of [["title", titleBox], ["event", eventBox], ["score", scoreBox], ["CTA", ctaBox]] as const) {
      expect(value.x, `${name} left at ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(-1);
      expect(value.x + value.width, `${name} right at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width + 1);
      expect(value.y, `${name} top at ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(heroBox.y - 1);
      expect(value.y + value.height, `${name} bottom at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(heroBox.y + heroBox.height + 1);
      expect(value.y + value.height, `${name} is visible in the initial viewport at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(overlaps(titleBox, eventBox), `title/event overlap at ${viewport.width}x${viewport.height}`).toBe(false);
    expect(overlaps(titleBox, scoreBox), `title/score overlap at ${viewport.width}x${viewport.height}`).toBe(false);
    expect(overlaps(eventBox, scoreBox), `event/score overlap at ${viewport.width}x${viewport.height}`).toBe(false);
    expect(overlaps(scoreBox, ctaBox), `score/CTA overlap at ${viewport.width}x${viewport.height}`).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await expect(page.getByText("Email alerts coming soon")).toHaveCount(0);
  await expect(page.getByText("Get the reset signal", { exact: false })).toHaveCount(0);
});
