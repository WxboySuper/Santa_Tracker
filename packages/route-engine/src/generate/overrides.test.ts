import { describe, expect, it } from 'vitest';
import { applyOverrides } from './overrides';

describe('applyOverrides', () => {
  it('keeps a locked replacement when its vetoed source is absent from the initial selection', () => {
    const result = applyOverrides([
      { id: 'source', category: 'hub' },
      { id: 'replacement', category: 'hub' },
      { id: 'other', category: 'hub' },
    ], ['replacement', 'other'], {
      lock: ['replacement'],
      veto: ['source'],
      swap: { source: 'replacement' },
    });

    expect(result).toEqual(['replacement', 'other']);
  });
});
