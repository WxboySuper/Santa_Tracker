import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkA11y, injectAxe } from 'axe-playwright';
import type { TestRunnerConfig } from '@storybook/test-runner';

const screenshotDirectory = resolve(process.env.INIT_CWD ?? process.cwd(), 'storybook-screenshots');
mkdirSync(screenshotDirectory, { recursive: true });

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page, context) {
    await checkA11y(page, undefined, { detailedReport: true, detailedReportOptions: { html: true } });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${context.id}.png`),
      fullPage: true,
    });
  },
};

export default config;
