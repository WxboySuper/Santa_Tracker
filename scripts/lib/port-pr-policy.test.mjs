import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluatePortPrPolicy,
  parsePortBranch,
  targetBranchFromSlug,
} from './port-pr-policy.mjs';

describe('port PR policy', () => {
  it('parses port branch names', () => {
    assert.deepEqual(parsePortBranch('port/346-to-main'), {
      sourcePrNumber: 346,
      targetSlug: 'main',
    });
    assert.deepEqual(parsePortBranch('port/346-to-feature-dependabot-changelog-skip'), {
      sourcePrNumber: 346,
      targetSlug: 'feature-dependabot-changelog-skip',
    });
  });

  it('decodes target slugs', () => {
    assert.equal(targetBranchFromSlug('main'), 'main');
    assert.equal(
      targetBranchFromSlug('feature-dependabot-changelog-skip'),
      'feature/dependabot-changelog-skip',
    );
  });

  it('allows a stable forward-port into main', () => {
    const result = evaluatePortPrPolicy({
      headRef: 'port/346-to-main',
      baseRef: 'main',
      targetBranch: 'main',
      sourcePrHeadRef: 'hotfix/patch',
      sourcePrBaseRef: 'stable/1.6.x',
      sourcePrNumber: 346,
    });
    assert.equal(result.ok, true);
  });

  it('rejects a port from the next-major line', () => {
    const result = evaluatePortPrPolicy({
      headRef: 'port/99-to-main',
      baseRef: 'main',
      targetBranch: 'main',
      sourcePrHeadRef: 'hotfix/patch',
      sourcePrBaseRef: 'main',
      sourcePrNumber: 99,
    });
    assert.equal(result.ok, false);
  });
});
