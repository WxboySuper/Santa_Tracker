import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { prepareAppState } from './testSetup';

const polygonFeature = (coordinates: number[][][]) => ({
  type: 'Feature' as const,
  properties: { outlookType: 'tornado', probability: '15%' },
  geometry: {
    type: 'Polygon' as const,
    coordinates,
  },
});

const seededForecast = () => {
  const today = new Date().toISOString();
  const cycleDate = today.slice(0, 10);

  return {
    version: '1.0.0',
    type: 'forecast-cycle' as const,
    timestamp: today,
    forecastCycle: {
      days: {
        1: {
          day: 1,
          metadata: {
            issueDate: today,
            validDate: today,
            issuanceTime: '1200',
            createdAt: today,
            lastModified: today,
            lowProbabilityOutlooks: [],
            outlookOpacities: { tornado: 0.55 },
          },
          data: {
            tornado: [['15%', [polygonFeature([[
              [-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34],
            ]])]]],
            categorical: [['SLGT', [polygonFeature([[
              [-97.5, 34.5], [-96.5, 34.5], [-96.5, 35.5], [-97.5, 35.5], [-97.5, 34.5],
            ]])]]],
          },
        },
        2: {
          day: 2,
          metadata: {
            issueDate: today,
            validDate: today,
            issuanceTime: '1200',
            createdAt: today,
            lastModified: today,
            lowProbabilityOutlooks: [],
          },
          data: {
            wind: [['30%', [polygonFeature([[
              [-99, 35], [-97, 35], [-97, 37], [-99, 37], [-99, 35],
            ]])]]],
          },
        },
      },
      currentDay: 1,
      cycleDate,
    },
    mapView: { center: [39.8283, -98.5795], zoom: 4 },
  };
};

const acceptAgreementsIfPresent = async (page: import('@playwright/test').Page) => {
  for (let i = 0; i < 2; i += 1) {
    const agreementCheckbox = page.getByRole('checkbox', { name: /I have read and agree/i });
    if (!(await agreementCheckbox.isVisible().catch(() => false))) break;
    await agreementCheckbox.check();
    await page.getByRole('button', { name: /Accept & Continue/i }).click();
  }
};

const seedForecastSession = async (page: import('@playwright/test').Page) => {
  const forecastData = seededForecast();
  await page.addInitScript(({ payload }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.7.0');
    localStorage.setItem('forecastData', JSON.stringify(payload));
  }, { payload: forecastData });
};

const openTransferExport = async (page: import('@playwright/test').Page) => {
  await page.getByRole('tab', { name: 'Tools' }).click();
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import / Export Forecast' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('tab', { name: 'Export' }).click();
};

test.describe('Forecast transfer modal', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
    await seedForecastSession(page);
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
    await openTransferExport(page);
  });

  test('downloads a current-day KMZ with outlook placemarks', async ({ page }) => {
    await page.locator('#transfer-format').selectOption('kmz');
    await page.locator('#transfer-scope').selectOption('current-day');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/gfc-day-1-.*\.kmz$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) throw new Error('KMZ day export did not produce a file');

    const zip = await JSZip.loadAsync(await readFile(downloadPath));
    const docKml = zip.file('doc.kml');
    expect(docKml).not.toBeNull();
    const kml = await docKml!.async('string');

    expect(kml).toContain('<Folder><name>Day 1</name>');
    expect(kml).toContain('<name>Tornado 15%</name>');
    expect(kml).toContain('<Data name="gfc_probability_key"><value>15%</value></Data>');
    expect(kml).toContain('<coordinates>');
    expect(kml).not.toContain('<name>Wind 30%</name>');
    expect(zip.file('README-limitations.txt')).not.toBeNull();
  });

  test('downloads a full-cycle KMZ containing every populated day', async ({ page }) => {
    await page.locator('#transfer-format').selectOption('kmz');
    await page.locator('#transfer-scope').selectOption('cycle');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/gfc-cycle-.*\.kmz$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) throw new Error('KMZ cycle export did not produce a file');

    const zip = await JSZip.loadAsync(await readFile(downloadPath));
    const docKml = await zip.file('doc.kml')!.async('string');
    expect(docKml).toContain('<Folder><name>Day 1</name>');
    expect(docKml).toContain('<Folder><name>Day 2</name>');
    expect(docKml).toContain('<name>Wind 30%</name>');
  });

  test('supports the split-kmz layout strategy in the transfer modal', async ({ page }) => {
    await page.locator('#transfer-format').selectOption('kmz');
    await page.locator('#transfer-scope').selectOption('cycle');
    await page.locator('#transfer-kml-strategy').selectOption('split');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) throw new Error('Split KMZ export did not produce a file');

    const zip = await JSZip.loadAsync(await readFile(downloadPath));
    expect(zip.file('days/day-1/tornado.kml')).not.toBeNull();
    expect(zip.file('days/day-2/wind.kml')).not.toBeNull();

    const dayOneTornado = await zip.file('days/day-1/tornado.kml')!.async('string');
    expect(dayOneTornado).toContain('<name>Tornado 15%</name>');
  });

  test('exports only the selected outlook', async ({ page }) => {
    await page.locator('#transfer-format').selectOption('kml');
    await page.locator('#transfer-outlook').selectOption('tornado');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) throw new Error('Selected-outlook export did not produce a file');

    const kml = await readFile(downloadPath, 'utf8');
    expect(kml).toContain('<name>Tornado 15%</name>');
    expect(kml).not.toContain('<name>Categorical SLGT</name>');
  });

  test('imports an exported KML back into the forecast', async ({ page }) => {
    await page.locator('#transfer-format').selectOption('kml');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const downloadPath = await (await downloadPromise).path();
    expect(downloadPath).not.toBeNull();
    if (!downloadPath) throw new Error('KML export did not produce a file');

    await expect(page.getByRole('dialog', { name: 'Import / Export Forecast' })).toBeHidden();
    await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import / Export Forecast' });
    await dialog.getByRole('tab', { name: 'Import' }).click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await dialog.getByText('Choose a forecast file').click();
    await (await fileChooserPromise).setFiles({
      name: 'forecast-roundtrip.kml',
      mimeType: 'application/vnd.google-earth.kml+xml',
      buffer: await readFile(downloadPath),
    });
    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Forecast imported from KML!', { exact: false })).toBeVisible();
  });

});
