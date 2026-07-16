import { expect, test } from "@playwright/test";

test("capture visual QA matrix", async ({ browser }, info) => {
  test.skip(info.project.name !== "chromium");
  for (const viewport of [{ name: "desktop-1440x1000", width: 1440, height: 1000 }, { name: "laptop-1280x800", width: 1280, height: 800 }, { name: "mobile-390x844", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.request.post("/api/lab/reset-demo");
    await page.goto("/");
    await page.waitForFunction(() => { const media = document.querySelector(".hero-video") as HTMLVideoElement | null; return Boolean(media && media.readyState >= 2); });
    await page.mouse.wheel(0, viewport.width <= 420 ? 1700 : 2700);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `artifacts/screenshots/${viewport.name}.png` });
    if (viewport.name.startsWith("desktop") || viewport.name.startsWith("mobile")) {
      await page.mouse.wheel(0, viewport.width <= 420 ? 900 : 1300);
      await page.waitForTimeout(900);
      const payoffName = viewport.name.replace(viewport.width <= 420 ? "mobile" : "desktop", viewport.width <= 420 ? "mobile-payoff" : "desktop-payoff");
      await page.screenshot({ path: `artifacts/screenshots/${payoffName}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.close();
  }
});
