import { test, expect, type Page } from '@playwright/test';

const startForecast = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.7.0');
  });
  await page.goto('/?localTestAccount=premium', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Day 1', exact: true }).click();
  await page.getByRole('button', { name: 'Start Workflow', exact: true }).click();
  await expect(page).toHaveURL(/\/forecast$/, { timeout: 15000 });
  await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
};

test('edits a drawn probabilistic polygon through the map paint-bucket flow', async ({ page }) => {
  await startForecast(page);

  await page.getByRole('button', { name: 'Tor', exact: true }).click();
  await page.getByRole('button', { name: 'Draw polygons' }).click();

  const viewport = page.locator('.map-container .ol-viewport');
  const box = await viewport.boundingBox();
  if (!box) throw new Error('Map viewport has no measurable bounds');
  const points = [
    [box.x + box.width * 0.42, box.y + box.height * 0.38],
    [box.x + box.width * 0.58, box.y + box.height * 0.38],
    [box.x + box.width * 0.58, box.y + box.height * 0.54],
    [box.x + box.width * 0.42, box.y + box.height * 0.54],
  ];
  for (const [x, y] of points) await page.mouse.click(x, y);
  await page.mouse.dblclick(points[0][0], points[0][1]);

  await page.getByRole('button', { name: 'Edit polygon risk' }).click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.46);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});
