import { test, expect } from '@playwright/test';
import { prepareAppState } from './testSetup';

test.describe('Discussion workflow', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('keeps the standalone day discussion route usable on a portrait phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/discussion');

    await expect(page.getByRole('heading', { name: 'Forecast Discussion' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('preserves drafts while switching scopes and supports combining outlooks', async ({ page }) => {
    await page.route('**/api/local/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ uid: 'e2e-user', email: 'e2e@example.test', displayName: 'E2E Forecaster', betaAccess: true }),
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Full Outlook' }).first().click();
    await page.getByRole('button', { name: 'Start Blank Cycle' }).click();
    await expect(page).toHaveURL('/forecast');

    await page.getByRole('link', { name: 'Discussion' }).click();
    await expect(page).toHaveURL('/discussion');
    const scope = page.getByRole('combobox', { name: 'Discussion scope' });
    const editor = page.locator('textarea.diy-textarea');
    await expect(scope).toBeVisible();
    await editor.fill('Day one draft survives scope changes.');

    await scope.selectOption('day2');
    await expect(editor).toHaveValue('');
    await editor.fill('Day two draft.');
    await scope.selectOption('day1');
    await expect(editor).toHaveValue('Day one draft survives scope changes.');

    await page.getByText('Combine scopes').click();
    const checkboxes = page.locator('.discussion-scope-checkboxes input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.getByRole('button', { name: 'Combine selected' }).click();
    await expect(scope.locator('option')).toHaveCount(3);
  });
});
