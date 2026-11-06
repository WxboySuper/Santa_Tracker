import { describe, expect, it } from 'vitest';
import { applyOverrides } from './overrides';

const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('applyOverrides', () => {
  it('applies swaps, locks, and vetoes without duplicating stops', () => {
    expect(applyOverrides(pool, ['a', 'b'], { lock: ['c'], veto: ['a'], swap: { b: 'd' } }))
      .toEqual(['d', 'c']);
  });

  it('replaces an unlocked selection with a lock and rejects too many locks', () => {
    expect(applyOverrides(pool, ['a', 'b'], { lock: ['c'] })).toEqual(['a', 'c']);
    expect(() => applyOverrides(pool, ['a', 'b'], { lock: ['a', 'b', 'c'] })).toThrow();
  });

  it('rejects unknown ids, conflicting directives, and swaps of missing stops', () => {
    expect(() => applyOverrides(pool, ['a'], { lock: ['z'] })).toThrow();
    expect(() => applyOverrides(pool, ['a'], { lock: ['a'], veto: ['a'] })).toThrow();
    expect(() => applyOverrides(pool, ['a'], { swap: { b: 'c' } })).toThrow();
    expect(() => applyOverrides(pool, ['a', 'b'], { swap: { a: 'b' } })).toThrow();
    expect(() => applyOverrides(pool, ['a'], { swap: { a: 'c' }, veto: ['c'] })).toThrow();
  });

  it('requires swaps and new locks to preserve the selected category quota', () => {
    const categorized = [
      { id: 'hub-a', category: 'hub' }, { id: 'hub-b', category: 'hub' },
      { id: 'nature-a', category: 'nature' }, { id: 'nature-b', category: 'nature' },
    ];
    expect(() => applyOverrides(categorized, ['hub-a', 'nature-a'], { swap: { 'hub-a': 'nature-b' } })).toThrow(/preserve category/);
    expect(applyOverrides(categorized, ['hub-a', 'nature-a'], { lock: ['hub-b'] })).toEqual(['hub-b', 'nature-a']);
  });

  it('fills a lock into a same-category vacancy before preserving other categories', () => {
    const categorized = [
      { id: 'hub-a', category: 'hub' }, { id: 'nature-a', category: 'nature' },
      { id: 'nature-b', category: 'nature' },
    ];
    expect(applyOverrides(categorized, ['hub-a', 'nature-a'], { veto: ['hub-a'], lock: ['nature-b'] }))
      .toEqual(['nature-b']);
  });
});
