import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateBranchPolicy } from './branch-policy.mjs';

describe('branch policy', () => {
  it('allows feature branches to the next-major main line', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'feature/foo' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows hotfix to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, true);
  });

  it('allows the deployment config workflow fix to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'fix/deployment-config' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows the opencode workflow branch to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'add-opencode-workflow' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });

  it('allows a stable maintenance line to accept hotfixes', () => {
    const result = evaluateBranchPolicy({ baseRef: 'stable/1.6.x', headRef: 'hotfix/urgent' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'hotfix');
  });

  it('allows arbitrary source branch names to main', () => {
    const result = evaluateBranchPolicy({ baseRef: 'main', headRef: 'anything-at-all' });
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'main-integration');
  });
});
