import { test, expect } from '@playwright/test';
import { prepareAppState } from './testSetup';

/**
 * Navigation tests — verifies routing between pages works correctly.
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('can navigate from homepage to forecast page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start a new forecast/i }).click();
    await expect(page).toHaveURL('/forecast');
  });

  test('can navigate from homepage to verification page', async ({ page }) => {
    await page.goto('/');
    const verifyBtn = page.getByRole('link', { name: /Verification/i }).first();
    await verifyBtn.click();
    await expect(page).toHaveURL('/verification');
  });

  test('navbar links navigate correctly', async ({ page }) => {
    await page.goto('/forecast');
    // Click the "Home" nav link in the navbar tab strip
    await page.getByRole('link', { name: /^Home$/i }).click();
    // toHaveURL matches the full URL, so match either bare / or the full origin
    await expect(page).toHaveURL(/\/$/);
  });

  test('preserves unsaved discussion drafts by day across route navigation', async ({ page }) => {
    await page.goto('/discussion');
    const editor = page.getByPlaceholder(/Write your forecast discussion here/i);
    await expect(editor).toBeVisible();

    await editor.fill('Day 1 draft');
    await page.getByRole('link', { name: /^Forecast$/i }).click();
    await expect(page).toHaveURL(/\/forecast$/);
    await page.getByRole('tab', { name: /^Days$/i }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();

    await page.getByRole('link', { name: /^Discussion$/i }).click();
    await expect(page).toHaveURL(/\/discussion$/);
    await expect(editor).toHaveValue('');
    await editor.fill('Day 2 draft');

    await page.getByRole('link', { name: /^Forecast$/i }).click();
    await expect(page).toHaveURL(/\/forecast$/);
    await page.getByRole('tab', { name: /^Days$/i }).click();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('link', { name: /^Discussion$/i }).click();
    await expect(page).toHaveURL(/\/discussion$/);
    await expect(editor).toHaveValue('Day 1 draft');

    await page.getByRole('link', { name: /^Forecast$/i }).click();
    await expect(page).toHaveURL(/\/forecast$/);
    await page.getByRole('tab', { name: /^Days$/i }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('link', { name: /^Discussion$/i }).click();
    await expect(page).toHaveURL(/\/discussion$/);
    await expect(editor).toHaveValue('Day 2 draft');
  });
});
