import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verifies the app loads and core routes are reachable
 * without any white-screen crashes.
 */

test.describe('App smoke tests', () => {
  const bypassLocalBeta = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(() => {
      localStorage.setItem('gfc-local-beta-bypass', 'true');
    });
  };

  const acceptAgreementsIfPresent = async (page: import('@playwright/test').Page) => {
    for (let i = 0; i < 2; i += 1) {
      const agreementCheckbox = page.getByRole('checkbox', { name: /I have read and agree/i });
      if (!(await agreementCheckbox.isVisible().catch(() => false))) break;

      await agreementCheckbox.check();
      await page.getByRole('button', { name: /Accept & Continue/i }).click();
    }
  };

  test('homepage loads with correct title', async ({ page }) => {
    await bypassLocalBeta(page);
    await page.goto('/?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page).toHaveTitle(/Graphical Forecast Creator/);
    await expect(page.getByRole('heading', { level: 1, name: /Create forecasts/i })).toBeVisible();
  });

  test('navbar is visible on homepage', async ({ page }) => {
    await bypassLocalBeta(page);
    await page.goto('/?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.locator('.app-navbar__brandName--full')).toBeVisible();
  });

  test('forecast page loads without crashing', async ({ page }) => {
    await page.goto('/forecast?localBetaBypass=true');
    // The OpenLayers map container renders with class .map-container
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
  });

  test('forecast editor is usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bypassLocalBeta(page);
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tabbed-integrated-toolbar')).toBeVisible();
    await expect(page.locator('.map-history-button[aria-label="Undo"]')).toBeVisible();
    await expect(page.locator('.map-history-button[aria-label="Undo"]')).toBeDisabled();
    await expect(page.locator('.map-history-button[aria-label="Redo"]')).toBeDisabled();
    await expect(page.locator('.map-toolbar-surface > *')).toHaveCount(7);
    const toolbarClassifications = [
      ['map-history-group', 'history'],
      ['map-toolbar-spacer', 'spacer'],
      ['map-toolbar-divider', 'divider'],
      ['mode-key', 'key'],
      ['mode-delete', 'delete'],
      ['mode-draw', 'draw'],
      ['mode-pan', 'pan'],
    ] as const;
    const mapToolbarOrder = await page.locator('.map-toolbar-surface > *').evaluateAll(
      (elements, classifications) =>
        elements.map((element) => {
          const classification = classifications.find(([className]) => element.classList.contains(className));
          if (classification) return classification[1];
          throw new Error(`Unexpected map toolbar child: ${element.className}`);
        }),
      toolbarClassifications
    );
    expect(mapToolbarOrder).toEqual(['pan', 'draw', 'delete', 'divider', 'key', 'spacer', 'history']);
    await expect(page.getByRole('complementary', { name: /map legend/i })).not.toBeVisible();
    await page.getByRole('button', { name: /show map key/i }).click();
    await expect(page.getByRole('complementary', { name: /map legend/i })).toBeVisible();

    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(documentOverflow).toBeLessThanOrEqual(1);

    for (const tabName of ['Draw', 'Days', 'Layers', 'Tools']) {
      await page.getByRole('tab', { name: tabName }).click();
      await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true');
    }

    await page.getByRole('tab', { name: 'Draw' }).click();
    await expect(page.getByRole('button', { name: /wind/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /15%/i }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Days' }).click();
    await expect(page.getByRole('button', { name: '2' })).toBeVisible();

    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: /Save/i }).first()).toBeVisible();

    const mobileToolbarRow = page.locator('.tabbed-integrated-toolbar__row');
    await mobileToolbarRow.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(page.getByRole('button', { name: /Reset All/i }).first()).toBeVisible();
  });

  test('forecast editor uses mobile controls in landscape phone view', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await bypassLocalBeta(page);
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tabbed-integrated-toolbar__status-bar')).not.toBeVisible();
    await expect(page.locator('.map-toolbar-help-surface')).not.toBeVisible();
    await expect(page.locator('.map-history-button[aria-label="Undo"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /show map key/i })).toBeVisible();

    await page.getByRole('button', { name: /show map key/i }).click();
    await expect(page.getByRole('complementary', { name: /map legend/i })).toBeVisible();

    const legendBox = await page.getByRole('complementary', { name: /map legend/i }).boundingBox();
    const toolbarBox = await page.locator('.tabbed-integrated-toolbar').boundingBox();
    if (!legendBox || !toolbarBox) {
      throw new Error('Expected the mobile key popout and toolbar to have measurable bounds.');
    }
    expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(toolbarBox.y + 1);

    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: /Undo/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /History/i }).first()).toBeVisible();

    const landscapeToolbarRow = page.locator('.tabbed-integrated-toolbar__row');
    await landscapeToolbarRow.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(page.getByRole('button', { name: /Reset All/i }).first()).toBeVisible();

    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(documentOverflow).toBeLessThanOrEqual(1);
  });

  test('verification page loads without crashing', async ({ page }) => {
    await bypassLocalBeta(page);
    await page.goto('/verification?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page.getByRole('heading', { name: /Verification/i })).toBeVisible({ timeout: 10000 });
  });

  test('monitor page loads with live controls and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bypassLocalBeta(page);
    await page.goto('/monitor?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);

    await expect(page.getByRole('heading', { name: 'Monitor' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Monitor map')).toBeVisible();
    await expect(page.getByRole('complementary', { name: /Monitor controls/i })).toBeVisible();

    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(documentOverflow).toBeLessThanOrEqual(1);
  });

  test('404 / unknown routes do not white-screen', async ({ page }) => {
    await page.goto('/does-not-exist');
    // App shell (navbar) should still render — not a blank page
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('gated workstream routes stay unreachable while disabled', async ({ page }) => {
    await bypassLocalBeta(page);

    await page.goto('/tropical?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page).not.toHaveURL(/\/tropical(?:\?|$)/);
    await expect(page.getByRole('heading', { name: /Tropical Workspace/i })).not.toBeVisible({ timeout: 5000 });

    await page.goto('/collaborate?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page).not.toHaveURL(/\/collaborate(?:\?|$)/);
    await expect(page.getByRole('heading', { name: /Collaboration Room/i })).not.toBeVisible({ timeout: 5000 });
  });
});
