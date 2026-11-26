import { describe, expect, it } from 'vitest';
import { allocateBandFill } from './order-coverage';

describe('band fill allocation', () => {
  it('allocates the full remainder when every band weight is zero', () => {
    const allocation = allocateBandFill([
      { offset: -480, weight: 0 },
      { offset: -420, weight: 0 },
      { offset: -360, weight: 0 },
    ], 17);

    expect(allocation.reduce((total, item) => total + item.count, 0)).toBe(17);
    expect(Object.fromEntries(allocation.map(({ offset, count }) => [offset, count]))).toEqual({
      '-480': 5,
      '-420': 6,
      '-360': 6,
    });
  });
});
