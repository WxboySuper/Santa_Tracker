import { mkdirSync } from 'node:fs';
import type { TestRunnerConfig } from '@storybook/test-runner';

mkdirSync('../../storybook-screenshots', { recursive: true });

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    await page.screenshot({
      path: `../../storybook-screenshots/${context.id}.png`,
      fullPage: true,
    });
  },
};

export default config;
