import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkA11y, injectAxe } from 'axe-playwright';
import type { TestRunnerConfig } from '@storybook/test-runner';

const screenshotDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../storybook-screenshots');

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page, context) {
    mkdirSync(screenshotDirectory, { recursive: true });
    await checkA11y(page, undefined, { detailedReport: true, detailedReportOptions: { html: true } });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${context.id}.png`),
      fullPage: true,
    });
  },
};

export default config;
