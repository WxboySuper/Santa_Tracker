import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PORTING_MANUAL_LABEL,
  isManualForwardPortPr,
  parseOpenPortPrsJson,
  resolvePortTargets,
  shouldSkipPorting,
} from './port-targets.mjs';

describe('port targets', () => {
  it('ports stable merges to main only', () => {
    assert.deepEqual(resolvePortTargets({ baseBranch: 'stable/1.6.x' }), ['main']);
  });

  it('does not port main merges back to stable', () => {
    assert.deepEqual(resolvePortTargets({ baseBranch: 'main' }), []);
  });

  it('detects a manual forward-port PR by source reference', () => {
    assert.equal(
      isManualForwardPortPr({ headRefName: 'fix/port-to-main', title: 'Forward-port of #591' }, 591),
      true,
    );
  });

  it('ignores incidental source PR mentions', () => {
    assert.equal(
      isManualForwardPortPr({ headRefName: 'fix/unrelated', title: 'Follow-up', body: 'See #591' }, 591),
      false,
    );
  });

  it('parses open port PR JSON defensively', () => {
    assert.deepEqual(parseOpenPortPrsJson('[{"number":1,"headRefName":"hotfix/x"}]'), [
      { number: 1, headRefName: 'hotfix/x' },
    ]);
    assert.deepEqual(parseOpenPortPrsJson('not-json'), []);
    assert.deepEqual(parseOpenPortPrsJson(), []);
  });

  it('ignores automated port branches', () => {
    assert.equal(isManualForwardPortPr({ headRefName: 'port/591-to-main', title: '[Port] foo' }, 591), false);
  });

  it('skips when porting/manual label is present', () => {
    const result = shouldSkipPorting({ labels: [PORTING_MANUAL_LABEL], sourcePrNumber: 10 });
    assert.equal(result.skip, true);
  });

  it('skips when an open manual forward-port PR exists', () => {
    const result = shouldSkipPorting({
      openPortPrs: [{ number: 600, headRefName: 'hotfix/x', title: 'Forward-port of #10' }],
      sourcePrNumber: 10,
    });
    assert.equal(result.skip, true);
    assert.equal(result.manualPr?.number, 600);
  });
});
