/**
 * Single authoritative source for free-versus-premium product-boundary copy.
 *
 * The product has exactly three boundaries:
 * - Signed-out: everything is local; no account, no hosted sync.
 * - Free account: the full local workflow plus metadata-only workflow
 *   awareness sync. Hosted cloud storage is read-only/unavailable.
 * - Premium: everything above plus hosted cloud cycle storage and
 *   cross-device access.
 *
 * These strings are shared by the Pricing, Account, and Cloud Library surfaces
 * so the boundaries stay exact and consistent, and so the same restriction is
 * not restated with different wording on adjacent cards.
 */

export const PRICING_COPY = {
  /** One-line core boundary used by heroes and headers. */
  coreBoundary: 'Forecasting stays free. Premium covers the hosted layer.',
  /** Explains the free product in one sentence. */
  freeSummary: 'Free is the full local forecasting product: build, write, save, export, and verify forecasts on your device.',
  /** Explains the premium product in one sentence. */
  premiumSummary: 'Premium adds the official hosted service: cloud cycle storage and cross-device access.',
  /** What happens if premium lapses. */
  downgradeSummary: 'If premium lapses, local work stays fully available and only new cloud writes are disabled.',
  /** Signed-out boundary. */
  signedOut: 'Signed out: everything works locally. Sign in to sync account settings.',
  /** Free account boundary. */
  freeAccount: 'Free account: the full local workflow, plus metadata-only workflow awareness sync.',
  /** Premium boundary. */
  premiumAccount: 'Premium: hosted cloud storage and cross-device access on top of the free workflow.',
} as const;

/** Returns the plan-boundary line for the current entitlement state. */
export const getBoundaryCopy = ({
  signedIn,
  premiumActive,
}: {
  signedIn: boolean;
  premiumActive: boolean;
}): string => {
  if (!signedIn) {
    return PRICING_COPY.signedOut;
  }
  return premiumActive ? PRICING_COPY.premiumAccount : PRICING_COPY.freeAccount;
};
