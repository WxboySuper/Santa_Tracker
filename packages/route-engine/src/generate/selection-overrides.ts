import type { RouteOverrides } from './overrides';

export function assertNoLegacySelectionOverrides(overrides: RouteOverrides): void {
  const legacyDirectiveCount = (overrides.lock?.length ?? 0) + Object.keys(overrides.swap ?? {}).length;
  if (legacyDirectiveCount > 0) {
    throw new Error('Lock and swap selection overrides are unsupported by the midnight sweep');
  }
}
