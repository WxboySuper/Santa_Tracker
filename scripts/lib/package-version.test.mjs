import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveStableVersion,
  evaluateVersionPolicy,
  hasBetaPrerelease,
  isReleasePromotionBranch,
  releaseBranchForStable,
} from './package-version.mjs';

describe('package-version policy', () => {
  it('detects beta prerelease', () => {
    assert.equal(hasBetaPrerelease('1.6.0-beta.1'), true);
    assert.equal(hasBetaPrerelease('1.6.0'), false);
  });

  it('derives stable from beta prerelease', () => {
    assert.equal(deriveStableVersion('1.6.0-beta.2'), '1.6.0');
    assert.equal(deriveStableVersion('1.6.0'), '1.6.0');
  });

  it('builds release branch name', () => {
    assert.equal(releaseBranchForStable('1.6.0'), 'release/v1.6.0');
    assert.equal(isReleasePromotionBranch('release/v1.6.0'), true);
  });

  it('requires beta prerelease on beta branch', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0',
      targetBranch: 'beta',
    });
    assert.equal(result.ok, false);
  });

  it('allows beta to main promotion pull requests with beta version', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0-beta.1',
      targetBranch: 'main',
      headRef: 'beta',
      eventName: 'pull_request',
    });
    assert.equal(result.ok, true);
  });

  it('allows feature branches targeting main with beta version', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0-beta.1',
      targetBranch: 'main',
      headRef: 'feature/foo',
      eventName: 'pull_request',
    });
    assert.equal(result.ok, true);
  });

  it('allows release branch PR to main with stable version', () => {
    const result = evaluateVersionPolicy({
      version: '1.6.0',
      targetBranch: 'main',
      headRef: 'release/v1.6.0',
      eventName: 'pull_request',
    });
    assert.equal(result.ok, true);
  });

  it('requires stable versions on a stable release line', () => {
    const result = evaluateVersionPolicy({
      version: '1.7.0-beta.1',
      targetBranch: 'stable/1.6.x',
      headRef: 'hotfix/urgent',
      eventName: 'pull_request',
    });
    assert.equal(result.ok, false);
  });
});
