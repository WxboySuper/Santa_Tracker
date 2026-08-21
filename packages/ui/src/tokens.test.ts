import { describe, expect, it } from 'vitest';
import { colors, radius } from './tokens';

describe('@santa-tracker/ui', () => {
  it('exposes design tokens', () => {
    expect(colors.santaRed).toBe('#dc2626');
    expect(radius.md).toBe('0.75rem');
  });
});

