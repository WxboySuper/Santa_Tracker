import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { expectNoSeriousAxeIssues } from "./axe-check";

async function verifyCountdown(page: Page): Promise<void> {
  const timer = page.getByRole("timer");
  await expect(timer).toHaveAttribute("aria-live", "off");
  await expect(page.getByText("Days", { exact: true })).toBeVisible();
  await expect(page.getByText("Hours", { exact: true })).toBeVisible();
  await expect(page.getByText("Minutes", { exact: true })).toBeVisible();
  await expect(page.getByText("Seconds", { exact: true })).toBeVisible();
  await expect(timer).toHaveAttribute("aria-label", /\d+ days?/i);
  const loadedLabel = await timer.getAttribute("aria-label");
  expect(loadedLabel).toMatch(/\d+ days?/i);
  await page.clock.runFor(60_000);
  await expect.poll(() => timer.getAttribute("aria-label")).not.toBe(loadedLabel);
  await expectNoSeriousAxeIssues(page);
}

async function verifyNarrowWidths(page: Page): Promise<void> {
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole("timer").locator(".countdown-tile").first()).toContainText(/\d{3}/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
}

async function verifyAccessibilityPreferences(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".festive-backdrop *, .festive-backdrop")).toHaveCount(5);
  const moving = await page.locator(".festive-backdrop *, .festive-backdrop").evaluateAll((layers) => layers
    .map((layer) => getComputedStyle(layer).animationName)
    .filter((name) => name !== "none"));
  expect(moving).toEqual([]);

  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("home works at narrow widths, with motion settings, and passes axe", async ({ page }) => {
	await page.clock.install({ time: new Date("2026-09-14T10:00:00Z") });
	await page.goto("/");
	await verifyCountdown(page);
	await verifyNarrowWidths(page);
	await verifyAccessibilityPreferences(page);
});
