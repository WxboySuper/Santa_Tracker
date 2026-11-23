import { compareBudgets } from './bundle-budget.mjs';

describe('compareBudgets', () => {
  it('passes assets at or below each tier limit', () => {
    expect(compareBudgets({ public: { js: 100, css: 20 } }, { public: { js: 100, css: 25 } }))
      .toEqual([
        { tier: 'public', kind: 'js', actual: 100, limit: 100, passed: true },
        { tier: 'public', kind: 'css', actual: 20, limit: 25, passed: true },
      ]);
  });

  it('flags any exceeded budget and treats missing measurements as zero', () => {
    expect(compareBudgets({ '3d': { js: 101, css: 10 } }, { public: { js: 1, css: 1 }, '3d': { js: 100, css: 10 } }))
      .toEqual([
        { tier: 'public', kind: 'js', actual: 0, limit: 1, passed: true },
        { tier: 'public', kind: 'css', actual: 0, limit: 1, passed: true },
        { tier: '3d', kind: 'js', actual: 101, limit: 100, passed: false },
        { tier: '3d', kind: 'css', actual: 10, limit: 10, passed: true },
      ]);
  });
});
