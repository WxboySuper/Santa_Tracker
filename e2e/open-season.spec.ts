import { expect, test, getRuntimeConfig } from "./fixtures";
import { expectNoSeriousAxeIssues } from "./axe-check";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

test("the admin emergency switch hides and restores the tracker for visitors", async ({ page, browser }) => {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  const loginPassword = (await getRuntimeConfig(runtimeFile)).adminPassword;
  const login = await page.request.post("/api/admin/login", { data: { password: loginPassword } });
  expect(login.status()).toBe(200);
  const hide = await replaceFlags(page, { tracker: true, advent: false });
  expect(hide.status()).toBe(200);

  const visitorContext = await browser.newContext();
  try {
    const visitor = await visitorContext.newPage();
    await expect.poll(async () => (await visitor.request.get("/tracker")).status(), { timeout: 8_000 }).toBe(404);
    const hiddenApi = await visitor.request.get("/api/route");
    expect(hiddenApi.status()).toBe(404);
    expect(hiddenApi.headers()["cache-control"]).toBe("private, no-store");

    const show = await replaceFlags(page, { tracker: false, advent: false });
    expect(show.status()).toBe(200);
    await expect.poll(async () => (await visitor.request.get("/tracker")).status(), { timeout: 8_000 }).toBe(200);
  } finally {
    await visitorContext.close();
  }
});

async function replaceFlags(page: Page, hidden: { tracker: boolean; advent: boolean }) {
  const current = await page.request.get("/api/admin/feature-flags");
  expect(current.status()).toBe(200);
  const etag = current.headers().etag;
  if (!etag) throw new Error("Feature flags response omitted its ETag");
  return page.request.put("/api/admin/feature-flags", {
    headers: { "If-Match": etag },
    data: { version: 1, hidden },
  });
}

test("emergency switches work at desktop and mobile sizes with keyboard confirmation", async ({ page }) => {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  const loginPassword = (await getRuntimeConfig(runtimeFile)).adminPassword;
  expect((await page.request.post("/api/admin/login", { data: { password: loginPassword } })).status()).toBe(200);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/admin");
    const trackerSwitch = page.getByRole("switch", { name: "Hide tracker" });
    await expect(trackerSwitch).toBeVisible();
    await expect(page.getByText(/Last updated:/)).toBeVisible();

    await tabTo(page, "Hide tracker");
    await page.keyboard.press("Space");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Visitors will see a 404/)).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Emergency switches saved." })).toBeVisible();
    await expect(trackerSwitch).toBeChecked();

    await tabTo(page, "Hide tracker");
    await page.keyboard.press("Space");
    await expect(page.getByRole("status").filter({ hasText: "Emergency switches saved." })).toBeVisible();
    await expect(trackerSwitch).not.toBeChecked();
  }
});

async function tabTo(page: Page, accessibleName: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const activeLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (activeLabel === accessibleName) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Could not reach ${accessibleName} with the keyboard`);
}
