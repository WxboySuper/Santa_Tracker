import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, negotiateLocale } from './index';

describe('locale negotiation', () => {
  it('selects a supported language from Accept-Language', () => {
    expect(negotiateLocale('fr-CA, en-US;q=0.8')).toBe('en');
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
  });

  it('falls back when the header is absent or unsupported', () => {
    expect(negotiateLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('de,ja;q=0.9')).toBe(DEFAULT_LOCALE);
  });

  it('handles wildcards and ignores malformed quality values', () => {
    expect(negotiateLocale('de, *;q=0.5')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('en;q=abc, de;q=0.9')).toBe(DEFAULT_LOCALE);
  });
});
