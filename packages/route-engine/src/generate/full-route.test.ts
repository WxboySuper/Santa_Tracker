import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('committed 2026 route draft', () => {
  it('passes the mechanical route audit', () => {
    const output = execSync('pnpm route:audit', { encoding: 'utf8', stdio: 'pipe' });
    expect(output).toContain('| Deterministic snapshot regeneration');
    expect(output).toMatch(/\| Deterministic snapshot regeneration\s+\| PASS/);
    expect(output).toMatch(/\n\d+\/\d+ checks passed\./);
  }, 60_000);
});
