import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, getRuntimeConfig, test } from "./fixtures";

test("capture key pages for the browser matrix", async ({ page }, testInfo) => {
  const screenshotRoot = process.env.E2E_MATRIX_SCREENSHOT_DIR;
  if (!screenshotRoot) throw new Error("E2E_MATRIX_SCREENSHOT_DIR must point to a scratch folder");

  const projectFolder = path.join(screenshotRoot, testInfo.project.name);
  await mkdir(projectFolder, { recursive: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Santa Tracker" })).toBeVisible();
  await page.screenshot({ path: path.join(projectFolder, "home.png"), fullPage: true });

  await page.goto("/tracker");
  await expect(page.getByRole("application")).toBeVisible();
  await page.screenshot({ path: path.join(projectFolder, "tracker-map.png"), fullPage: true });
  await page.getByRole("button", { name: "Show text view" }).click();
  await expect(page.getByRole("region", { name: "Show text view" })).toBeVisible();
  await page.screenshot({ path: path.join(projectFolder, "tracker-text.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/route", async route => {
    const response = await route.fetch();
    const data = await response.json() as {
      route_nodes: {
        location: { name: string; lat: number; lng: number; timezone_offset?: number };
        schedule?: { arrival_utc?: string | null; departure_utc?: string | null };
      }[];
    };
    const stop = data.route_nodes[0];
    if (!stop) throw new Error("The route needs a stop for the immersive-mode screenshot");
    const arrival = Date.now() + 60 * 60 * 1000;
    stop.location = { ...stop.location, name: "London", lat: 51.5072, lng: -0.1276, timezone_offset: 0 };
    stop.schedule = { ...stop.schedule, arrival_utc: new Date(arrival).toISOString(), departure_utc: new Date(arrival + 15 * 60 * 1000).toISOString() };
    await route.fulfill({ response, json: data });
  });
  await page.goto("/tracker?mode=immersive");
  const citySearch = page.getByRole("textbox", { name: "Choose a city or route stop" });
  await citySearch.fill("London");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "London", exact: true }).first().click();
  await expect(page.getByText(/Santa reaches you at/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(projectFolder, "tracker-after-escape.png"), fullPage: true });

  await page.goto("/advent");
  await expect(page.getByRole("list", { name: /advent calendar/i }).getByRole("listitem")).toHaveCount(24);
  await page.screenshot({ path: path.join(projectFolder, "advent-calendar.png"), fullPage: true });

  await page.goto("/village?view=static");
  await expect(page.getByRole("img", { name: /snowy North Pole village/i })).toBeVisible();
  await page.screenshot({ path: path.join(projectFolder, "village-static.png"), fullPage: true });

  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  const { adminPassword } = await getRuntimeConfig(runtimeFile);
  await page.request.post("/api/admin/login", { data: { password: adminPassword } });
  await page.goto("/admin");
  await page.waitForFunction(() => !document.body.innerText.includes("Loading…"), undefined, { timeout: 8_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(projectFolder, "admin-emergency-switches.png"), fullPage: true });
});
