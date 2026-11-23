import { isChangelogExempt, parseConventionalTitle } from './pr-hygiene.mjs';

describe('parseConventionalTitle', () => {
  it.each(['feat: add tracker', 'fix(map): handle missing routes', 'revert: undo route import'])('accepts %s', (title) => {
    expect(parseConventionalTitle(title)).not.toBeNull();
  });

  it.each(['Feature: add tracker', 'feat!: break API', 'wip: work', 'fix(scope): '])('rejects %s', (title) => {
    expect(parseConventionalTitle(title)).toBeNull();
  });
});

describe('isChangelogExempt', () => {
  it('allows the no-changelog label, exempt title types, and Dependabot authors', () => {
    expect(isChangelogExempt({ parsedTitle: { type: 'fix' }, labels: [{ name: 'no-changelog' }] })).toBe(true);
    expect(isChangelogExempt({ parsedTitle: { type: 'docs' } })).toBe(true);
    expect(isChangelogExempt({ parsedTitle: { type: 'fix' }, author: 'dependabot[bot]' })).toBe(true);
  });

  it('requires a changelog entry for ordinary changes', () => {
    expect(isChangelogExempt({ parsedTitle: { type: 'perf' }, author: 'octocat' })).toBe(false);
  });
});
