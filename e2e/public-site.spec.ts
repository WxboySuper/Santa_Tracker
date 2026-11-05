import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const loginPassword = process.env.E2E_ADMIN_PASSWORD;
if (!loginPassword) throw new Error("E2E_ADMIN_PASSWORD is not configured by global setup");
const gatedPaths = ["/tracker", "/advent", "/advent/1", "/api/route", "/api/advent/manifest"];

async function expectNoSeriousAxeIssues(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const issues = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(issues, JSON.stringify(issues.map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    targets: nodes.map((node) => node.target),
  })), null, 2)).toEqual([]);
}

function expectClosedCacheHeaders(route: string, cacheControl: string | undefined) {
  expect(cacheControl, route).toContain("no-store");
  if (route.startsWith("/api/")) expect(cacheControl).toContain("private");
}

test("home works at narrow widths, with motion settings, and passes axe", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-14T10:00:00Z") });
  await page.goto("/");
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

  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole("timer").locator(".countdown-tile").first()).toContainText(/\d{3}/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".festive-backdrop *, .festive-backdrop")).toHaveCount(5);
  const moving = await page.locator(".festive-backdrop *, .festive-backdrop").evaluateAll((layers) => layers
    .map((layer) => getComputedStyle(layer).animationName)
    .filter((name) => name !== "none"));
  expect(moving).toEqual([]);

  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("closed season gates pages and APIs, including malformed credentials", async ({ page, request }) => {
  for (const route of gatedPaths) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
    expectClosedCacheHeaders(route, response.headers()["cache-control"]);
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: /track santa/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /tracker|village/i })).toHaveCount(0);

  const forged = await request.get("/advent", { headers: { cookie: "admin_token=forged-token" } });
  expect(forged.status()).toBe(404);
  const malformed = await request.get("/advent", { headers: { cookie: "admin_token=%" } });
  expect(malformed.status()).toBe(404);
  const login = await request.post("/api/admin/login", { data: { password: loginPassword } });
  expect(login.status()).toBe(200);
  for (const route of gatedPaths) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
  }
  const routeResponse = await request.get("/api/route");
  expect(routeResponse.headers()["cache-control"]).toBe("private, no-store");
});

test("Advent exposes 24 doors, day 1 game, and rejects invalid days", async ({ page }) => {
  await page.goto("/advent");
  const calendar = page.getByRole("list", { name: /advent calendar/i });
  await expect(calendar.getByRole("listitem")).toHaveCount(24);
  await expect(calendar.getByRole("link", { name: /open day 1/i })).toBeVisible();
  await expect(calendar.getByRole("img")).toHaveCount(23);
  await expect(calendar.getByRole("img").first()).toHaveAttribute("aria-label", /Dec 2/);
  await expectNoSeriousAxeIssues(page);

  await page.goto("/advent/1");
  const game = page.getByTitle("Ornament Smash");
  await expect(game).toBeVisible();
  await expect.poll(() => game.evaluate((element) => (element as HTMLIFrameElement).contentDocument?.readyState)).toBe("complete");
  await expect.poll(() => game.evaluate((element) => (element as HTMLIFrameElement).contentDocument?.body?.children.length ?? 0)).toBeGreaterThan(0);
  const gameFrame = page.frameLocator('iframe[title="Ornament Smash"]');
  await gameFrame.getByRole("button", { name: "Start Game" }).click();
  await expect(gameFrame.locator("#gameHUD")).toBeVisible();
  await expect(gameFrame.getByText("20 Remaining")).toBeVisible();
  for (const route of ["/advent/25", "/advent/abc"]) {
    expect((await page.request.get(route)).status(), route).toBe(404);
  }
});

test("accessible Advent calendar in the closed project matches axe", async ({ page }) => {
  const login = await page.request.post("/api/admin/login", { data: { password: loginPassword } });
  expect(login.status()).toBe(200);
  await page.goto("/advent");
  await expect(page.getByRole("listitem")).toHaveCount(24);
  await expectNoSeriousAxeIssues(page);
});
