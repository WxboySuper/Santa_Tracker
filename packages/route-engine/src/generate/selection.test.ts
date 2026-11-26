import { describe, expect, it } from 'vitest';
import { compareStableIds } from './selection';

describe('compareStableIds', () => {
  it('orders route ids deterministically without locale collation', () => {
    expect(['Q10', 'Q2', 'ne-13', 'ne-4'].sort(compareStableIds)).toEqual(['ne-13', 'ne-4', 'Q10', 'Q2']);
  });

  it('uses lexical order for nonnumeric ids', () => {
    expect(['place-c', 'place-a', 'place-b'].sort(compareStableIds)).toEqual(['place-a', 'place-b', 'place-c']);
  });
});
