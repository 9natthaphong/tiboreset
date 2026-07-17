import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

async function waitForHome(page: Page) {
  await expect(page.locator(".cinematic-hero")).toHaveAttribute("data-first-frame-ready", "true", { timeout: 20_000 });
  await expect(page.locator(".oracle-loader")).toHaveCount(0, { timeout: 5_000 });
}

async function expectInsideViewport(page: Page, locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(viewport, "viewport is configured").not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width + 1);
}

async function visibleOverflow(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const containedSelectors = [
      ".chart-scroll",
      ".coefficient-table",
      ".lab-table-shell",
      ".data-lab details > pre",
      ".cinematic-hero",
    ];
    return Array.from(document.querySelectorAll<HTMLElement>("body *")).flatMap((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) return [];
      const container = containedSelectors.map(selector => element.closest<HTMLElement>(selector)).find(Boolean);
      if (container && container !== element) {
        const containerRect = container.getBoundingClientRect();
        if (containerRect.left >= -1 && containerRect.right <= viewportWidth + 1) return [];
      }
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return [];
      const identity = element.id ? `#${element.id}` : element.classList.length ? `.${Array.from(element.classList).join(".")}` : element.tagName.toLowerCase();
      return [{ identity, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }];
    }).slice(0, 20);
  });
}

test("public pages remain contained across production viewport targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The viewport matrix runs once in Chromium.");
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForHome(page);
    const tabs = page.locator(".forecast-view-tabs");
    await tabs.scrollIntoViewIfNeeded();
    await page.getByRole("tab", { name: "SIGNALS" }).click();
    for (const name of ["MOVEMENT", "SIGNALS", "RANGE"]) {
      await expectInsideViewport(page, page.getByRole("tab", { name }), `${name} tab at ${viewport.width}px`);
    }
    await expectInsideViewport(page, page.getByRole("tab", { name: "SIGNALS" }), `active Signals tab at ${viewport.width}px`);
    await expectInsideViewport(page, page.getByRole("heading", { name: "Signals ranked by impact" }), `Signals heading at ${viewport.width}px`);
    const contributionRows = page.locator("#forecast-panel-signals .signal-rank-row");
    for (let index = 0; index < await contributionRows.count(); index += 1) {
      await expectInsideViewport(page, contributionRows.nth(index), `contribution row ${index + 1} at ${viewport.width}px`);
    }
    const diagnostics = page.locator("[data-testid='advanced-diagnostics'] > summary");
    await expectInsideViewport(page, diagnostics, `Diagnostics control at ${viewport.width}px`);
    if (viewport.width <= 900) {
      const menu = page.locator(".mobile-navigation > summary");
      await expectInsideViewport(page, menu, `mobile menu trigger at ${viewport.width}px`);
      await menu.click();
      await expectInsideViewport(page, page.locator(".mobile-navigation nav"), `mobile menu panel at ${viewport.width}px`);
      await menu.click();
    }
    const footer = page.locator(".site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expectInsideViewport(page, footer, `footer at ${viewport.width}px`);
    const visitCounter = page.locator(".public-visit-counter");
    if (await visitCounter.count()) await expectInsideViewport(page, visitCounter, `visit counter at ${viewport.width}px`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `home document width at ${viewport.width}px`).toBe(true);
    expect(await visibleOverflow(page), `home overflowing elements at ${viewport.width}px`).toEqual([]);

    for (const path of ["/lab/data", "/privacy"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} document width at ${viewport.width}px`).toBe(true);
      expect(await visibleOverflow(page), `${path} overflowing elements at ${viewport.width}px`).toEqual([]);
    }
  }
});
