import { test, expect } from '@playwright/test';

test('exposes the land-masking controls on the beta forecast workflow', async ({ page }) => {
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

  await page.getByText('Layers', { exact: true }).click();
  await page.getByRole('button', { name: 'Trim outlooks to land' }).click();
  await expect(page.getByLabel('Land mask strategy')).toBeVisible();
  await expect(page.getByLabel('Land mask strategy')).toHaveValue('us-country-minus-great-lakes');
  await expect(page.getByLabel('Auto-trim while drawing')).not.toBeChecked();
  await expect(page.getByLabel('Preview trim only')).not.toBeChecked();
});
