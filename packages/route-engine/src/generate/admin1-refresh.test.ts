import { describe, expect, it } from 'vitest';
import { candidateWithAdmin1Code } from '../../../../tools/route-generator/refresh-admin1.mjs';

describe('admin-1 refresh candidate preservation', () => {
  it('preserves foreign administrative codes outside target coverage', () => {
    const candidate = { country: 'FR', admin1Code: 'FR-IDF', id: 'paris' };

    expect(candidateWithAdmin1Code(candidate, undefined)).toEqual(candidate);
  });

  it('normalizes preserved target-country codes', () => {
    const candidate = { country: 'US', admin1Code: ' us-ca ', id: 'california-place' };

    expect(candidateWithAdmin1Code(candidate, undefined)).toEqual({ ...candidate, admin1Code: 'US-CA' });
  });
});
