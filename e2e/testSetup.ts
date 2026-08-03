import type { Page } from '@playwright/test';

/** Prepares app-level browser state so route and UI tests can exercise their target behavior. */
export const prepareAppState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.7.0');
  });
};
