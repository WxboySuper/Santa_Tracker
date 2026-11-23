import { expect, test } from "./fixtures";

test("tracker falls back from vector to raster to text during a local tile outage", async ({ page }) => {
  await page.goto("/");
  const routeBefore = await page.evaluate(async () => {
    const response = await fetch("/api/route");
    if (!response.ok) throw new Error(`Route API returned ${response.status}`);
    return await response.json() as { route_nodes: unknown[] };
  });
  expect(routeBefore.route_nodes.length).toBeGreaterThan(1);

  const vectorStarted = new Promise<number>(resolve => {
    page.on("request", request => {
      if (request.url().startsWith("https://tiles.openfreemap.org/")) resolve(Date.now());
    });
  });
  const rasterRequested = new Promise<number>(resolve => {
    page.on("request", request => {
      if (request.url().startsWith("https://tile.openstreetmap.org/")) resolve(Date.now());
    });
  });
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());

  await page.goto("/tracker?mode=tv");
  const vectorAt = await Promise.race([vectorStarted, page.waitForTimeout(15_000).then(() => null)]);
  expect(vectorAt).not.toBeNull();
  const rasterAt = await Promise.race([rasterRequested, page.waitForTimeout(15_000).then(() => null)]);
  expect(rasterAt).not.toBeNull();
  await expect(page.getByRole("region", { name: "Show text view" })).toBeVisible({ timeout: 15_000 });
  const textAt = Date.now();
  await expect(page.getByRole("heading", { name: "Recent stops" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Santa tracker TV dashboard" })).toBeVisible();

  const routeAfter = await page.evaluate(async () => {
    const response = await fetch("/api/route");
    if (!response.ok) throw new Error(`Route API returned ${response.status}`);
    return await response.json() as { route_nodes: unknown[] };
  });
  expect(routeAfter).toEqual(routeBefore);
  console.log(`MAP_OUTAGE_TIMING vector-to-raster=${rasterAt! - vectorAt!}ms raster-to-text=${textAt - rasterAt!}ms`);
});
