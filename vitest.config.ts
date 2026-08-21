import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'apps/web/src/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/*.config.*', '**/test-fixtures/**'],
    },
    typecheck: {
      enabled: true,
    },
  },
});
