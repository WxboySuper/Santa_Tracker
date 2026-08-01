import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAutoResolveAllForwardPortConflicts,
  classifyForwardPortConflicts,
} from './port-conflicts.mjs';

describe('port conflicts', () => {
  it('keeps every forward-port conflict human-owned', () => {
    const result = classifyForwardPortConflicts([
      'server/package.json',
      'server/package-lock.json',
    ]);
    assert.deepEqual(result.autoResolvable, []);
    assert.deepEqual(result.needsHuman, ['server/package.json', 'server/package-lock.json']);
    assert.equal(canAutoResolveAllForwardPortConflicts(result.needsHuman), false);
  });
});
