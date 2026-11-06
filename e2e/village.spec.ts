import { expect, test } from './fixtures';

test('the village preview is hidden from visitors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'closed', 'closed-season behaviour');
  const response = await page.goto('/village');
  expect(response?.status()).toBe(404);
});

test('the village preview opens, lists its places, and works without WebGL', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'open', 'preview is only reachable with the local override');
  await page.goto('/village');
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Tracker' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Places in the village' });
  await expect(menu.getByRole('button')).toHaveCount(8);
  await menu.getByRole('button', { name: 'The Music Hall' }).click();
  await expect(page.getByRole('complementary', { name: 'The Music Hall' })).toBeVisible();
  await page.keyboard.press('Escape');
  await menu.getByRole('button', { name: 'The Control Tower' }).click();
  await expect(page.getByRole('link', { name: /Track Santa/ })).toHaveAttribute('href', '/tracker');
});

test('the simple village view needs no WebGL and links to every open place', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'open', 'preview is only reachable with the local override');
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/village');
  await expect(page.getByText('This browser can’t draw the 3D village')).toBeVisible();
  await expect(page.getByRole('link', { name: /Track Santa/ })).toHaveAttribute('href', '/tracker');
  await page.goto('/village?view=static');
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Tracker' })).toBeVisible();
  await expect(page.getByRole('img', { name: /snowy North Pole village/ })).toBeVisible();
});
