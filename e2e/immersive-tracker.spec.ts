import { expect, test } from "./fixtures";

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
});

test("immersive controls work on a phone with reduced motion and blocked browser features", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, error: (failure: { code: number }) => void) => error({ code: 1 }) } });
  });
  await page.goto("/tracker?mode=immersive");
  await expect(page.getByRole("button", { name: "Arrival chimes off" })).toBeVisible();
  await expect(page.locator(".tracker-controls")).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText(/Location access was unavailable/)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter immersive mode" })).toBeVisible();
});
