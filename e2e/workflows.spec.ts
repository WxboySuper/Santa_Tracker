import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const workflowPanel = (page: Page) => page.locator('section[aria-label="Forecast package workflow"]');
const homeNav = (page: Page) => page.locator('a[href="/"]').last();
const forecastNav = (page: Page) => page.locator('a[href="/forecast"]');
const discussionNav = (page: Page) => page.locator('a[href="/discussion"]');

/** Starts each test from a genuinely empty local session while accepting app agreements. */
const prepareWorkflowSession = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gfc-e2e-session-initialized') === 'true') return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.3.0');
    sessionStorage.setItem('gfc-e2e-session-initialized', 'true');
  });
};

/** Starts one of the user-facing workflow templates from Home. */
const startWorkflow = async (page: Page, scope: string, expectedLabel: string): Promise<void> => {
  await page.goto('/?localTestAccount=premium');
  await page.getByRole('button', { name: scope, exact: true }).click();
  await page.getByRole('button', { name: 'Start Workflow', exact: true }).click();
  await expect(page).toHaveURL(/\/forecast$/);
  await homeNav(page).click();
  await expect(page.locator('main').last()).toContainText(expectedLabel);
  await forecastNav(page).click();
  await expect(workflowPanel(page)).toBeVisible();
};

test.describe('Workflow continuity', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await prepareWorkflowSession(page);
  });

  test('starts every built-in workflow at its intended first day', async ({ page }) => {
    const cases = [
      { scope: 'Day 1', label: 'Severe Convective Day 1', day: 'Day 1 package' },
      { scope: 'Day 2', label: 'Severe Convective Day 2', day: 'Day 2 package' },
      { scope: 'Day 3', label: 'Severe Convective Day 3', day: 'Day 3 package' },
      { scope: 'Days 4-8', label: 'Severe Convective Days 4-8', day: 'Day 4 package' },
      { scope: 'Full Outlook', label: 'Convective Outlook (Full)', day: 'Day 1 package' },
    ];

    for (const workflowCase of cases) {
      await page.goto('/?localTestAccount=premium');
      await page.getByRole('button', { name: workflowCase.scope, exact: true }).click();
      await page.getByRole('button', { name: 'Start Workflow', exact: true }).click();
      await expect(page).toHaveURL(/\/forecast$/);
      await homeNav(page).click();
      await expect(page.locator('main').last()).toContainText(workflowCase.label);
      await forecastNav(page).click();
      await expect(workflowPanel(page)).toBeVisible();
      await expect(workflowPanel(page)).toContainText(workflowCase.day);
    }
  });

  test('does not carry a Day 1 discussion into a new Days 4-8 workflow', async ({ page }) => {
    await startWorkflow(page, 'Day 1', 'Severe Convective Day 1');

    await discussionNav(page).click();
    const editor = page.getByPlaceholder(/Write your forecast discussion here/i);
    await editor.fill('Day 1 continuity sentinel — must never appear in Days 4-8.');

    await homeNav(page).click();
    await page.getByRole('button', { name: 'Days 4-8', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(/Start the Severe Convective Days 4-8 workflow/i);
    await page.getByRole('button', { name: 'Start Workflow', exact: true }).click();
    await homeNav(page).click();
    await expect(page.locator('main').last()).toContainText('Severe Convective Days 4-8');
    await forecastNav(page).click();

    await discussionNav(page).click();
    await expect(editor).toHaveValue('');
    await expect(page.getByText(/Day 1 continuity sentinel/i)).not.toBeVisible();
  });

  test('preserves multiple saved scoped discussions through route navigation', async ({ page }) => {
    await startWorkflow(page, 'Full Outlook', 'Convective Outlook (Full)');
    await discussionNav(page).click();

    const scope = page.getByRole('combobox', { name: 'Discussion scope' });
    const editor = page.getByPlaceholder(/Write your forecast discussion here/i);
    await scope.selectOption('day1');
    await editor.fill('Day 1 draft survives a hard reload.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await discussionNav(page).click();
    await scope.selectOption('day4-8');
    await expect(scope).toHaveValue('day4-8');
    await editor.fill('Days 4-8 draft survives a hard reload.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await discussionNav(page).click();
    await expect(scope).toHaveValue('day4-8');
    await expect(editor).toHaveValue('Days 4-8 draft survives a hard reload.');

    await scope.selectOption('day1');
    await expect(editor).toHaveValue('Day 1 draft survives a hard reload.');
  });

  test('round-trips a workflow package through the actual download and upload controls', async ({ page }) => {
    await startWorkflow(page, 'Day 2', 'Severe Convective Day 2');
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Add custom layer' }).click();
    await page.getByLabel('Layer title').fill('Package fire layer');
    await page.getByLabel('Layer title').blur();
    await page.getByLabel('Category label').fill('Critical fire');
    await page.getByLabel('Category label').blur();
    await page.getByLabel('Category hatch').click();
    await page.getByRole('button', { name: 'Crosshatch', exact: true }).click();
    await page.getByRole('button', { name: 'Draw polygons' }).click();
    const viewport = page.locator('.map-container .ol-viewport');
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Map viewport has no measurable bounds');
    await page.mouse.click(box.x + box.width * .42, box.y + box.height * .38);
    await page.mouse.click(box.x + box.width * .58, box.y + box.height * .38);
    await page.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .56);
    await expect(workflowPanel(page)).toContainText('excluded from severe analytics and Auto-Categorical');
    await discussionNav(page).click();
    await page.getByPlaceholder(/Write your forecast discussion here/i).fill('Package round-trip sentinel.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await forecastNav(page).click();

    const downloadPromise = page.waitForEvent('download');
    await workflowPanel(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/workflow|forecast/i);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    if (downloadPath === null) throw new Error('Workflow export did not produce a readable file');

    const zip = await JSZip.loadAsync(await readFile(downloadPath));
    const manifest = JSON.parse(await zip.file('workflow_package.json')!.async('string'));
    const exportedLayer = manifest.forecast.forecastCycle.days['2'].customLayers.layers[0];
    expect(exportedLayer.label).toBe('Package fire layer');
    expect(exportedLayer.categories[0].style.hatch).toBe('crosshatch');
    expect(exportedLayer.features[0].geometry.type).toBe('Polygon');
    expect(manifest.customContent).toEqual({ included: true, severeAnalytics: 'excluded', autoCategorical: 'excluded' });

    await page.goto('/');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload workflow', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(downloadPath);
    await page.waitForTimeout(1000);

    await expect(page).toHaveURL(/\/$/);
    await forecastNav(page).click();
    await expect(workflowPanel(page)).toContainText('Day 2 package', { timeout: 15000 });
    await page.getByRole('radio', { name: 'Custom' }).click();
    await expect(page.getByLabel('Layer title')).toHaveValue('Package fire layer');
    await expect(page.getByLabel('Category hatch')).toHaveText('Crosshatch');
    await discussionNav(page).click();
    await expect(page.getByPlaceholder(/Write your forecast discussion here/i)).toHaveValue('Package round-trip sentinel.');
  });

  for (const viewport of [
    { name: 'portrait phone', width: 390, height: 844 },
    { name: 'constrained landscape phone', width: 844, height: 390 },
  ]) {
    test(`keeps the custom workflow disclosure readable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startWorkflow(page, 'Day 1', 'Severe Convective Day 1');
      await page.getByRole('radio', { name: 'Custom' }).click();
      await page.getByRole('button', { name: 'Add custom layer' }).click();

      await expect(workflowPanel(page).getByRole('note')).toContainText('excluded from severe analytics and Auto-Categorical');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('keeps workflow state after opening a second page in the same browser context', async ({ page, context }) => {
    await startWorkflow(page, 'Day 3', 'Severe Convective Day 3');
    await discussionNav(page).click();
    await page.getByPlaceholder(/Write your forecast discussion here/i).fill('Cross-page continuity sentinel.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(5500);

    const secondPage = await context.newPage();
    await secondPage.goto('/forecast?localTestAccount=premium');
    await expect(workflowPanel(secondPage)).toContainText('Day 3 package', { timeout: 15000 });
    await discussionNav(secondPage).click();
    await expect(secondPage.getByPlaceholder(/Write your forecast discussion here/i)).toHaveValue('Cross-page continuity sentinel.');
    await secondPage.close();
  });
});
