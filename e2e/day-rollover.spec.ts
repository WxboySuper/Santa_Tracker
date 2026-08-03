import { test, expect } from '@playwright/test';

const localDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const staleSession = () => {
  const today = new Date();
  const previousDay = new Date(today);
  previousDay.setDate(today.getDate() - 1);

  return {
    today: localDay(today),
    previousDay: localDay(previousDay),
    forecastData: {
      version: '0.5.0',
      type: 'forecast-cycle',
      timestamp: today.toISOString(),
      forecastCycle: {
        days: {
          1: {
            day: 1,
            metadata: {
              issueDate: today.toISOString(),
              validDate: today.toISOString(),
              issuanceTime: '0600',
              createdAt: today.toISOString(),
              lastModified: today.toISOString(),
              lowProbabilityOutlooks: [],
            },
            data: {
              tornado: [['2%', [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: {},
              }]]],
            },
          },
        },
        currentDay: 1,
        cycleDate: localDay(previousDay),
      },
      mapView: { center: [39.8283, -98.5795], zoom: 4 },
    },
  };
};

const openStaleSession = async (page: import('@playwright/test').Page) => {
  const session = staleSession();
  await page.addInitScript(({ sessionData }) => {
    localStorage.clear();
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.2.0');
    localStorage.setItem('forecastData', JSON.stringify(sessionData.forecastData));
    localStorage.setItem('gfc-last-active-local-day', sessionData.previousDay);
  }, { sessionData: session });

  await page.goto('/forecast?localBetaBypass=true');

  for (let i = 0; i < 2; i += 1) {
    const agreementCheckbox = page.getByRole('checkbox', { name: /I have read and agree/i });
    if (!(await agreementCheckbox.isVisible().catch(() => false))) break;

    await agreementCheckbox.check();
    await page.getByRole('button', { name: /Accept & Continue/i }).click();
  }

  await expect(page.getByRole('dialog').filter({ hasText: 'New day detected' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'New day detected' })).toBeVisible();
  return session;
};

test.describe('New day rollover prompt', () => {
  test('offers all four choices and keeps the session when deferred', async ({ page }) => {
    await openStaleSession(page);

    await expect(page.getByRole('button', { name: 'Download a copy & start new day' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Premium cloud save unavailable/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Keep for now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replace without saving' })).toBeVisible();

    await page.getByRole('button', { name: 'Keep for now' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'New day detected' })).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('forecastData'))).not.toBeNull();
  });

  test('downloads the restored session before starting a new day', async ({ page }) => {
    await openStaleSession(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download a copy & start new day' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/forecast/i);
    await expect(page.getByRole('dialog').filter({ hasText: 'New day detected' })).not.toBeVisible();
  });

  test('replaces the restored session without saving when explicitly selected', async ({ page }) => {
    await openStaleSession(page);

    await page.getByRole('button', { name: 'Replace without saving' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'New day detected' })).not.toBeVisible();
    await expect(page.getByText(/Previous session replaced/i)).toBeVisible();
  });
});
