import { describe, expect, it } from 'vitest';

describe('apps/web shell', () => {
  it('renders the home page import', async () => {
    const mod = await import('./page');
    expect(mod.default).toBeDefined();
  });
});

