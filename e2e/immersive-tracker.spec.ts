import { expect, test } from "./fixtures";
import path from "node:path";

declare global {
  interface Window { geoCalls: number; wakeRequests: number; wakeReleases: number }
}

test.describe.configure({ mode: "serial" });

test("tracker opens immersive mode and lets a visitor choose a city", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tracker?mode=immersive");
  await expect(page.getByRole("button", { name: "Exit immersive mode" })).toBeVisible();
  await expect(page.getByRole("region", { name: "See when Santa reaches me" })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Choose a city or route stop" });
  await search.fill("London");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Exit immersive mode" })).toBeVisible();
  await page.getByRole("button", { name: "London", exact: true }).click();
  await expect(page.getByText(/Santa reaches you at/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter immersive mode" })).toBeVisible();
  await page.getByRole("button", { name: "Enter immersive mode" }).click();
  await expect(page).toHaveURL(/mode=immersive/);
  await page.getByRole("button", { name: "Exit immersive mode" }).click();
  await expect(page).not.toHaveURL(/mode=immersive/);
});

test("immersive exit toggle stays keyboard reachable after idle controls fade", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tracker?mode=immersive");
  const exit = page.getByRole("button", { name: "Exit immersive mode" });
  await expect(exit).toBeVisible();
  await page.clock.fastForward(5000);
  await expect(page.locator(".tracker-controls").first()).toHaveCSS("visibility", "hidden");
  await expect(exit).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    if (await exit.evaluate(button => button === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(exit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter immersive mode" })).toBeVisible();
});

test("idle fade keeps controls visible while a control has keyboard focus", async ({ page }) => {
  await page.clock.install();
  await page.goto("/tracker?mode=immersive");
  const search = page.getByRole("textbox", { name: "Choose a city or route stop" });
  await search.focus();
  await page.clock.fastForward(5000);
  await expect(search).toBeFocused();
  await expect(page.locator(".tracker-controls").last()).toHaveCSS("visibility", "visible");
});

test("immersive controls work on a phone with reduced motion and blocked browser features", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.geoCalls = 0;
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, error: (failure: { code: number }) => void) => { window.geoCalls += 1; error({ code: 1 }); } } });
  });
  await page.clock.install();
  await page.goto("/tracker?mode=immersive");
  await expect(page.getByRole("button", { name: "Arrival chimes off" })).toBeVisible();
  await expect(page.locator(".tracker-controls").first()).toHaveCSS("transition-duration", "0s");
  await page.clock.fastForward(4500);
  await expect(page.locator(".tracker-controls").first()).toHaveCSS("visibility", "hidden");
  await page.locator(".tracker-stage").dispatchEvent("pointerdown");
  await expect(page.locator(".tracker-controls").first()).toHaveCSS("visibility", "visible");
  await expect.poll(() => page.evaluate(() => window.geoCalls)).toBe(0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect.poll(() => page.evaluate(() => window.geoCalls)).toBe(1);
  await expect(page.getByText(/Location access was unavailable/)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter immersive mode" })).toBeVisible();
});

test("TV mode keeps its dashboard visible across display sizes and exits from a remote key", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.wakeRequests = 0;
    window.wakeReleases = 0;
    Object.defineProperty(navigator, "wakeLock", { value: { request: () => {
      window.wakeRequests += 1;
      return Promise.resolve({ released: false, release: () => Promise.resolve().then(() => { window.wakeReleases += 1; }) });
    } } });
    window.localStorage.setItem("tracker:place", JSON.stringify({ name: "London", lat: 51.5072, lng: -0.1276, timezone: "Europe/London" }));
  });
  await page.goto("/tracker?mode=tv");
  await expect(page).toHaveURL(/mode=tv/);
  await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
  await expect(page.getByText("Santa local time")).toBeVisible();
  await expect(page.getByText("London:")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Arrival chimes off" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.wakeRequests)).toBeGreaterThan(0);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.wakeReleases)).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.wakeRequests)).toBeGreaterThan(1);

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exit TV mode" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
    const size = `${viewport.width}x${viewport.height}`;
    await page.screenshot({ path: testInfo.outputPath(path.join("tv-mode", `tv-${size}.png`)), fullPage: true });
  }

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/mode=tv/);
  await expect(page.getByRole("button", { name: "Enter TV mode" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.wakeReleases)).toBeGreaterThan(1);
});

test("TV mode restores the text route preference on exit", async ({ page }) => {
  await page.goto("/tracker");
  await page.getByRole("button", { name: "Show text view" }).click();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  await page.getByRole("button", { name: "Enter TV mode" }).click();
  await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Exit TV mode" }).click();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
});
