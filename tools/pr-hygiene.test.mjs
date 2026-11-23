import { checkPullRequest, isChangelogExempt, isChangelogUpdate, parseConventionalTitle } from './pr-hygiene.mjs';

describe('parseConventionalTitle', () => {
  it.each(['feat: add tracker', 'feat!: break API', 'feat(map)!: change route contract', 'fix(map): handle missing routes', 'revert: undo route import'])('accepts %s', (title) => {
    expect(parseConventionalTitle(title)).not.toBeNull();
  });

  it.each(['Feature: add tracker', 'feat!!: break API', 'wip: work', 'fix(scope): '])('rejects %s', (title) => {
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

describe('isChangelogUpdate', () => {
  it.each([
    [{ filename: 'CHANGELOG.md', status: 'added' }, true],
    [{ filename: 'CHANGELOG.md', status: 'modified' }, true],
    [{ filename: 'CHANGELOG.md', status: 'renamed', previous_filename: 'HISTORY.md' }, true],
    [{ filename: 'removed.md', status: 'renamed', previous_filename: 'CHANGELOG.md' }, false],
    [{ filename: 'CHANGELOG.md', status: 'removed' }, false],
    [{ filename: 'docs/CHANGELOG.md', status: 'modified' }, false],
  ])('returns %s', (file, expected) => {
    expect(isChangelogUpdate(file)).toBe(expected);
  });
});

describe('checkPullRequest', () => {
  it('still rejects an invalid Dependabot title while exempting its changelog', async () => {
    const result = await checkPullRequest({
      repository: { full_name: 'example/repo' },
      pull_request: { number: 123, title: 'Bump package', user: { login: 'dependabot[bot]' } },
    }, undefined);
    expect(result.ignored).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('PR title must match Conventional Commits');
  });
});
