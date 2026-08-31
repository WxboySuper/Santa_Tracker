import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.storybook.config.ts'],
  },
});
