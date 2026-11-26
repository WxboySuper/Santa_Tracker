import { describe, expect, it } from 'vitest';
import { canAcceptLocalProposal, type RouteCost } from './order-path';

describe('local route proposals', () => {
  it('rejects a shorter path when it adds an eastward leg or detour', () => {
    const current: RouteCost = { distance: 100, eastward: 0, detours: 0 };

    expect(canAcceptLocalProposal({ distance: 90, eastward: 1, detours: 0 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 90, eastward: 0, detours: 1 }, current)).toBe(false);
    expect(canAcceptLocalProposal({ distance: 99, eastward: 0, detours: 0 }, current)).toBe(true);
  });
});
