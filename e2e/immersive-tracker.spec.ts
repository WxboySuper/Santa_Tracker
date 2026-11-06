import { expect, test } from "./fixtures";
import path from "node:path";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    geoCalls: number;
    wakeRequests: number;
    wakeReleases: number;
    wakeResolvers: ((sentinel: { released: boolean; release: () => Promise<void> }) => void)[];
  }
}

test.describe.configure({ mode: "serial" });

test("tracker opens immersive mode and lets a visitor choose a city", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ensureFutureLondonArrival(page);
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
  await ensureFutureLondonArrival(page);
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
  await expect(page.getByRole("group", { name: "Map attribution" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenFreeMap © OpenMapTiles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
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

  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1760, height: 990 },
    { width: 1600, height: 900 },
    { width: 1440, height: 810 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exit TV mode" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Map attribution" })).toBeVisible();
    const attributionSize = `${Math.min(22, Math.max(18, viewport.width * 0.0125))}px`;
    await expect(page.locator(".tracker-tv-map-attribution")).toHaveCSS("font-size", attributionSize);
    expect(await page.evaluate(() => {
      const exitBounds = document.querySelector(".tracker-tv-exit")?.getBoundingClientRect();
      const headerBounds = document.querySelector(".tracker-tv-topline")?.getBoundingClientRect();
      return exitBounds && headerBounds ? exitBounds.bottom <= headerBounds.top : false;
    })).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
    if ([1280, 1920, 390].includes(viewport.width)) {
      const size = `${viewport.width}x${viewport.height}`;
      await page.screenshot({ path: testInfo.outputPath(path.join("tv-mode", `tv-${size}.png`)), fullPage: true });
    }
  }

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/mode=tv/);
  await expect(page.getByRole("button", { name: "Enter TV mode" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.wakeReleases)).toBeGreaterThan(1);
});

async function ensureFutureLondonArrival(page: Page) {
  await page.route("**/api/route", async route => {
    const response = await route.fetch();
    const data = await response.json() as {
      route_nodes: {
        location: { name: string; lat: number; lng: number; timezone_offset?: number };
        schedule?: { arrival_utc?: string | null; departure_utc?: string | null };
      }[];
    };
    const stop = data.route_nodes[0];
    if (!stop) throw new Error("The route needs a stop for the London arrival check");
    const arrival = Date.now() + 60 * 60 * 1000;
    stop.location = { ...stop.location, name: "London", lat: 51.5072, lng: -0.1276, timezone_offset: 0 };
    stop.schedule = {
      ...stop.schedule,
      arrival_utc: new Date(arrival).toISOString(),
      departure_utc: new Date(arrival + 15 * 60 * 1000).toISOString(),
    };
    await route.fulfill({ response, json: data });
  });
}

test("TV mode keeps long stop names readable with full accessible text", async ({ page }) => {
  const longName = "Itsukushima Shrine (Miyajima), Hatsukaichi";
  await page.route("**/api/route", async route => {
    const response = await route.fetch();
    const data = await response.json() as {
      route_nodes: {
        location: { name: string };
        schedule?: { arrival_utc?: string | null; departure_utc?: string | null };
      }[];
    };
    const nextNode = data.route_nodes[0];
    if (!nextNode) throw new Error("The route needs a stop for the long-name check");
    nextNode.location.name = longName;
    const arrival = Date.now() + 60 * 60 * 1000;
    nextNode.schedule = {
      ...nextNode.schedule,
      arrival_utc: new Date(arrival).toISOString(),
      departure_utc: new Date(arrival + 15 * 60 * 1000).toISOString(),
    };
    await route.fulfill({ response, json: data });
  });
  await page.goto("/tracker?mode=tv");
  const stopName = page.locator(".tracker-tv-stop-name").filter({ hasText: longName });
  await expect(stopName).toBeVisible();
  await expect(stopName).toHaveAttribute("title", longName);
  await expect(stopName).toHaveAttribute("aria-label", longName);
  await expect(stopName).toHaveCSS("text-overflow", "ellipsis");
  await expect(stopName).toHaveCSS("overflow", "hidden");
});

test("TV mode releases wake locks that resolve after exit", async ({ page }) => {
  await page.addInitScript(() => {
    window.wakeRequests = 0;
    window.wakeReleases = 0;
    window.wakeResolvers = [];
    Object.defineProperty(navigator, "wakeLock", { value: { request: () => {
      window.wakeRequests += 1;
      return new Promise(resolve => window.wakeResolvers.push(resolve));
    } } });
  });
  await page.goto("/tracker?mode=tv");
  await expect.poll(() => page.evaluate(() => window.wakeRequests)).toBeGreaterThan(0);
  const requestsBeforeEvents = await page.evaluate(() => window.wakeRequests);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.wakeRequests)).toBe(requestsBeforeEvents);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/mode=tv/);
  await page.evaluate(() => window.wakeResolvers.forEach(resolve => resolve({
      released: false,
      release: () => Promise.resolve().then(() => { window.wakeReleases += 1; }),
    })));
  await expect.poll(() => page.evaluate(() => window.wakeReleases)).toBe(requestsBeforeEvents);
  await expect.poll(() => page.evaluate(() => window.wakeRequests)).toBe(requestsBeforeEvents);
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

test("TV mode keeps the text route readable when both map layers fail", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.goto("/tracker?mode=tv");
  await expect(page.getByRole("region", { name: "Show text view" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Recent stops" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();
});
