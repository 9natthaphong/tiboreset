import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => { await request.post("/api/lab/reset-demo"); });

async function waitForOracle(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-motion-ready", "true");
}

test("homepage presents one clear forecast view at a time", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await expect(page.getByRole("heading", { name: "WILL TIBO RESET?" })).toBeVisible();
  await expect(page.locator(".mode-pill")).toContainText("DEMO MODE");
  await page.locator("#forecast").scrollIntoViewIfNeeded();
  await expect(page.getByRole("tab", { name: "MOVEMENT" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-testid='probability-trend']")).toBeVisible();
  await page.getByRole("tab", { name: "SIGNALS" }).click();
  await expect(page.locator("[data-testid='contribution-chart']")).toBeVisible();
  await page.getByRole("tab", { name: "RANGE" }).click();
  await expect(page.locator("[data-testid='forecast-range']")).toBeVisible();
  await expect(page.locator("[data-testid='usage-guidance']")).toContainText(/Conserve|Signals|plausible|Strong|announcement/i);
  await page.locator("#latest-signals").scrollIntoViewIfNeeded();
  await expect(page.getByText("LATEST SIGNALS FROM TIBO")).toBeVisible();
  await expect(page.getByText("DEMO SOURCE", { exact: true })).toBeVisible();
  await expect(page.locator("[data-testid='latest-post-card']").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("hero and range use the same forecast snapshot", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  const heroProbability = (await page.locator("[data-testid='hero-probability']").innerText()).replace(/\D/g, "");
  await page.locator("#forecast").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "RANGE" }).click();
  await expect(page.locator("[data-testid='chart-probability']")).toHaveText(`${heroProbability}%`);
  await page.getByRole("tab", { name: "SIGNALS" }).click();
  await expect(page.locator(".signal-ranking")).not.toContainText("milestone_proximity");
  const diagnosticSummary = page.locator(".advanced-diagnostics > summary");
  await expect(diagnosticSummary).toHaveCSS("cursor", "pointer");
  await diagnosticSummary.click();
  await expect(page.getByText("Configuration hash")).toBeVisible();
});

test("loader holds the page until frame zero is decoded", async ({ page }) => {
  await page.route("**/cinematic/tiboreset-hero.mp4", async route => {
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("CALIBRATING THE ORACLE")).toBeVisible();
  await expect(page.locator(".hero-video")).toHaveCSS("opacity", "0");
  expect(await page.locator(".hero-video").evaluate((media: HTMLVideoElement) => media.currentTime)).toBe(0);
  await waitForOracle(page);
  expect(await page.locator(".hero-video").evaluate((media: HTMLVideoElement) => media.currentTime)).toBeLessThan(0.08);
});

test("topbar follows hero progress in both directions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  const topbar = page.locator(".sacred-nav");
  await expect(topbar).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 2300); });
  await expect(topbar).toHaveAttribute("aria-hidden", "false");
  await expect(topbar).toHaveCSS("opacity", "1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(topbar).toHaveAttribute("aria-hidden", "true");
});

test("cinematic hero pins, scrubs, reverses, and holds the final frame", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  const hero = page.locator(".cinematic-hero");
  const video = page.locator(".hero-video");
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 1900); });
  await page.waitForTimeout(1100);
  const forward = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(forward).toBeGreaterThan(0.5);
  expect(Math.abs(await hero.evaluate(element => Math.round(element.getBoundingClientRect().top)))).toBeLessThanOrEqual(2);
  await page.evaluate(() => window.scrollTo(0, 4550));
  await page.waitForTimeout(1400);
  const holdStart = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  await expect(hero).toHaveAttribute("data-hold", "true");
  await page.evaluate(() => window.scrollTo(0, 5250));
  await page.waitForTimeout(650);
  const holdEnd = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(Math.abs(holdEnd - holdStart)).toBeLessThan(0.12);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(1100);
  const reverse = await video.evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(reverse).toBeLessThan(forward);
});

test("forecast tabs support keyboard navigation and sparse state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await page.locator("#forecast").scrollIntoViewIfNeeded();
  const movement = page.getByRole("tab", { name: "MOVEMENT" });
  await movement.focus();
  await movement.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "SIGNALS" })).toBeFocused();
  await expect(page.locator("[data-testid='contribution-chart']")).toBeVisible();
  await page.getByRole("tab", { name: "MOVEMENT" }).click();
  if (await page.locator("[data-testid='sparse-forecast-state']").count()) {
    await expect(page.getByText("LIVE TRACKING HAS JUST STARTED")).toBeVisible();
    await expect(page.locator(".movement-view .recharts-wrapper")).toHaveCount(0);
  }
});

test("reset history exposes verified source actions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await page.locator("#reset-history").scrollIntoViewIfNeeded();
  await expect(page.getByText("9M", { exact: true }).first()).toBeVisible();
  const sources = page.locator("#reset-history a.source-action");
  await expect(sources.first()).toBeVisible();
  await expect(sources.first()).toHaveAttribute("href", /^https:\/\/x\.com\//);
});

test("latest posts API validates limits and returns sorted Demo posts", async ({ request }) => {
  const invalid = await request.get("/api/posts/latest?limit=21");
  expect(invalid.status()).toBe(400);
  const response = await request.get("/api/posts/latest?limit=3");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.mode).toBe("demo");
  expect(body.posts).toHaveLength(3);
  expect(body.posts[0].text).toContain("Demo scenario");
  expect(Date.parse(body.posts[0].postedAt)).toBeGreaterThanOrEqual(Date.parse(body.posts[1].postedAt));
  expect(new Set(body.posts.map((post: { id: string }) => post.id)).size).toBe(body.posts.length);
});

test("safe health endpoint reports unavailable live dependencies", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = await response.json();
  expect(body).toEqual(expect.objectContaining({ app: "ok", mode: "demo", database: "unavailable" }));
  expect(["configured", "unavailable"]).toContain(body.xSource);
  expect(JSON.stringify(body)).not.toMatch(/key|secret|supabase\.co/i);
});

test("visibility resume triggers the polling fallback", async ({ page }) => {
  let healthCalls = 0;
  await page.route("**/api/health", async route => { healthCalls += 1; await route.continue(); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await expect(page.locator("main")).toHaveAttribute("data-refresh-ready", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => healthCalls, { timeout: 5000 }).toBeGreaterThan(0);
});

test("mobile public and Data Lab layouts do not overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await page.locator("#latest-signals").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const visibleCards = await page.locator("[data-testid='latest-post-card']").evaluateAll(cards => cards.filter(card => getComputedStyle(card).display !== "none").length);
  expect(visibleCards).toBe(3);
  await page.goto("/lab/data", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".lab-table-shell").first()).toBeHidden();
  await expect(page.locator(".lab-record-cards article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("reduced motion exposes a readable final hero without playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await expect(page.locator(".hero-story-payoff")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get the reset signal" })).toBeVisible();
  expect(await page.locator(".hero-video").evaluate((media: HTMLVideoElement) => media.currentTime)).toBeLessThan(0.08);
});

test("email demo lifecycle", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForOracle(page);
  await page.locator("#signal").scrollIntoViewIfNeeded();
  await page.getByPlaceholder("you@example.com").fill("demo@example.com");
  await page.locator(".check input").first().check();
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible();
  await page.goto("/control-room", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Simulate confirmation" }).click();
  await expect(page.getByRole("status")).toContainText("Completed simulate-confirmation");
  await page.getByRole("button", { name: "Simulate forecast crossing 70%" }).click();
  await expect(page.getByRole("status")).toContainText("Completed demo-event");
  await page.getByRole("button", { name: "Run notification evaluation" }).click();
  await expect(page.getByRole("status")).toContainText("Completed evaluate");
  await expect(page.getByText("Codex reset probability just crossed 70%")).toHaveCount(1);
  await page.getByRole("button", { name: "Simulate confirmed reset" }).click();
  await expect(page.getByText("A Codex quota reset has been announced")).toBeVisible();
});
