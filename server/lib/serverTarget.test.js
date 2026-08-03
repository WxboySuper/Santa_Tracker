'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getServerTarget, resolveServerTarget } = require('./serverTarget');

describe('server deployment target', () => {
  it('defaults omitted values to local', () => {
    assert.equal(resolveServerTarget(undefined), 'local');
    assert.equal(getServerTarget({}), 'local');
  });

  it('prefers SERVER_TARGET over SENTRY_ENVIRONMENT', () => {
    assert.equal(
      getServerTarget({ SERVER_TARGET: 'staging', SENTRY_ENVIRONMENT: 'production' }),
      'staging'
    );
  });

  it('falls back to SENTRY_ENVIRONMENT when SERVER_TARGET is unset', () => {
    assert.equal(getServerTarget({ SENTRY_ENVIRONMENT: 'beta' }), 'beta');
    assert.equal(getServerTarget({ SENTRY_ENVIRONMENT: 'production' }), 'production');
  });

  it('rejects invalid explicit SERVER_TARGET values', () => {
    assert.throws(() => resolveServerTarget('invalid'), /Invalid SERVER_TARGET/);
  });

  it('ignores invalid SENTRY_ENVIRONMENT values and defaults to local', () => {
    assert.equal(getServerTarget({ SENTRY_ENVIRONMENT: 'preview' }), 'local');
  });
});
