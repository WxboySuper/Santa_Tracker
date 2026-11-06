import { expect, test } from "./fixtures";

declare global {
  interface Window { geoCalls: number }
}

test("tracker opens immersive mode and lets a visitor choose a city", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tracker?mode=immersive");
  await expect(page.getByRole("button", { name: "Exit immersive mode" })).toBeVisible();
  await expect(page.getByRole("region", { name: "See when Santa reaches me" })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Choose a city or route stop" });
  await search.fill("London");
  await page.getByRole("button", { name: "London", exact: true }).click();
  await expect(page.getByText(/Santa reaches you at/)).toBeVisible();
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
  await page.locator('.tracker-stage [role="application"]').focus();
  await page.keyboard.press("Tab");
  await expect(exit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter immersive mode" })).toBeVisible();
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
