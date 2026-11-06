import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { expectNoSeriousAxeIssues } from './axe-check';

async function verifyCountdown(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Advent calendar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Track Santa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
    'href',
    '#main',
  );
  const timer = page.getByRole('timer');
  await expect(timer).toHaveAttribute('aria-live', 'off');
  await expect(page.getByText('Days', { exact: true })).toBeVisible();
  await expect(page.getByText('Hours', { exact: true })).toBeVisible();
  await expect(page.getByText('Minutes', { exact: true })).toBeVisible();
  await expect(page.getByText('Seconds', { exact: true })).toBeVisible();
  await expect(timer).toHaveAttribute('aria-label', /\d+ days?/i);
  const loadedLabel = await timer.getAttribute('aria-label');
  expect(loadedLabel).toMatch(/\d+ days?/i);
  await page.clock.runFor(60_000);
  await expect.poll(() => timer.getAttribute('aria-label')).not.toBe(loadedLabel);
  await expectNoSeriousAxeIssues(page);
}

async function verifyNarrowWidths(page: Page): Promise<void> {
  for (const size of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    await expect(page.getByRole('timer').locator('.countdown-tile').first()).toContainText(/\d{3}/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
  }
}

async function verifyAccessibilityPreferences(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const moving = await page
    .locator('.aurora-ribbon, .drifting-snow, .smoke-puff')
    .evaluateAll((layers) =>
      layers
        .map((layer) => getComputedStyle(layer).animationName)
        .filter((name) => name !== 'none'),
    );
  expect(moving).toEqual([]);

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('home works at narrow widths, with motion settings, and passes axe', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-14T10:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Tracker' })).toBeVisible();
  if (testInfo.project.name === 'open') {
    await expect(page.getByRole('link', { name: 'Visit the calendar' })).toHaveAttribute('href', '/advent');
    await expect(page.getByRole('link', { name: 'Open the tracker' })).toHaveAttribute('href', '/tracker');
  } else {
    await expect(page.getByRole('link', { name: 'Visit the calendar' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the tracker' })).toHaveCount(0);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await verifyCountdown(page);
  await verifyNarrowWidths(page);
  await verifyAccessibilityPreferences(page);
});
