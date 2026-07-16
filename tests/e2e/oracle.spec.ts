import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => { await request.post("/api/lab/reset-demo"); });

test("homepage and time machine", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WILL TIBO RESET?" })).toBeVisible();
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(page.getByText("PROBABILITY HISTORY")).toBeVisible();
  await page.getByRole("button", { name: "Reveal what happened" }).click();
  await expect(page.getByText(/synthetic demo timeline/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("cinematic hero pins and scrubs video in both directions", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".cinematic-hero");
  const video = page.locator(".hero-video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => { const media = document.querySelector(".hero-video") as HTMLVideoElement | null; return Boolean(media && media.readyState >= 2 && media.duration > 0); });
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(900);
  const forward = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  const pinnedTop = await hero.evaluate(element => Math.round(element.getBoundingClientRect().top));
  const forwardChapter = await hero.getAttribute("data-chapter");
  expect(forward).toBeGreaterThan(.5);
  expect(Math.abs(pinnedTop)).toBeLessThanOrEqual(2);
  expect(["discovery", "revelation", "payoff"]).toContain(forwardChapter);
  await page.mouse.wheel(0, -950);
  await page.waitForTimeout(900);
  const reverse = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(reverse).toBeLessThan(forward);
});

test("reduced motion exposes a readable final hero without a long pin", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".hero-story-payoff")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get the reset signal" })).toBeVisible();
});

test("email demo lifecycle", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill("demo@example.com");
  await page.locator(".check input").first().check();
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible();
  await page.goto("/lab");
  await page.getByRole("button", { name: "Simulate confirmation" }).click();
  await page.getByRole("button", { name: "Simulate forecast crossing 70%" }).click();
  await page.getByRole("button", { name: "Run evaluation again" }).click();
  await expect(page.getByText("Codex reset probability just crossed 70%")).toHaveCount(1);
  await page.getByRole("button", { name: "Simulate confirmed reset" }).click();
  await expect(page.getByText("A Codex quota reset has been announced")).toBeVisible();
});
