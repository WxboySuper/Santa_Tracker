import { PRICING_COPY, getBoundaryCopy } from './pricingCopy';

describe('pricingCopy', () => {
  it('defines all three product boundaries with distinct copy', () => {
    expect(PRICING_COPY.signedOut).toContain('Signed out');
    expect(PRICING_COPY.freeAccount).toContain('metadata-only');
    expect(PRICING_COPY.premiumAccount).toContain('hosted cloud storage');
  });

  it('returns the signed-out boundary when not signed in', () => {
    expect(getBoundaryCopy({ signedIn: false, premiumActive: true })).toBe(PRICING_COPY.signedOut);
  });

  it('returns the free boundary for a signed-in non-premium user', () => {
    expect(getBoundaryCopy({ signedIn: true, premiumActive: false })).toBe(PRICING_COPY.freeAccount);
  });

  it('returns the premium boundary for an active premium user', () => {
    expect(getBoundaryCopy({ signedIn: true, premiumActive: true })).toBe(PRICING_COPY.premiumAccount);
  });

  it('keeps the downgrade statement explicit and consistent', () => {
    expect(PRICING_COPY.downgradeSummary).toContain('local work stays fully available');
    expect(PRICING_COPY.downgradeSummary).toContain('cloud writes are disabled');
  });
});
