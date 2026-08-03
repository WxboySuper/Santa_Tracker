import { test, expect } from '@playwright/test';

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

const mockAutoTstmCapabilities = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/capabilities/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      }),
    });
  });
};

const mockCachedTstmLatest = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/tstm/latest**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-95, 35], [-94, 35], [-94, 36], [-95, 36], [-95, 35]]],
          },
          properties: { probability: 'TSTM' },
        }],
        run: '2026-06-13T12:00:00Z',
        domain: 'conus',
        forecastHours: [24],
        effectiveStart: '2026-06-13T12:00:00Z',
        effectiveEnd: '2026-06-14T12:00:00Z',
        thresholds: {
          calibratedThunderCoreProbability: 0.3,
          calibratedThunderSupportProbability: 0.1,
        },
        warnings: [],
        sources: {},
        generatedAt: '2026-06-13T12:00:00Z',
      }),
    });
  });
};

test.describe('Auto-TSTM workspace tools', () => {
  test.beforeEach(async ({ page }) => {
    await bypassLocalBeta(page);
    await mockAutoTstmCapabilities(page);
    await mockCachedTstmLatest(page);
  });

  test('exposes preview controls on the Tools tab and can cancel without mutating the map', async ({ page }) => {
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });

    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: 'Auto-TSTM' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Auto-TSTM' }).click();
    await expect(page.getByRole('heading', { name: 'Auto-TSTM Preview' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Polygons/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('dialog', { name: /Auto-TSTM Preview/i }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Auto-TSTM Preview' })).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('.map-container')).toBeVisible();
  });

  test('disables Auto-TSTM on unsupported forecast days', async ({ page }) => {
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });

    await page.getByRole('tab', { name: 'Days' }).click();
    await page.getByRole('button', { name: '3' }).click();

    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: 'Auto-TSTM' })).toBeDisabled();
  });
});
