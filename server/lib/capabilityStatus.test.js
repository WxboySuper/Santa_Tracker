'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CAPABILITY_REASON,
  getPublicCapabilityStatus,
  resolveCapabilityAvailability,
} = require('./capabilityStatus');

describe('capability status', () => {
  it('returns unknown for undeclared capability keys', () => {
    const status = resolveCapabilityAvailability('UNKNOWN_CAPABILITY');
    assert.equal(status.available, false);
    assert.equal(status.reason, CAPABILITY_REASON.UNKNOWN);
  });

  it('returns registry_disabled when the target matrix keeps the feature off', () => {
    const status = resolveCapabilityAvailability('TSTM_GENERATION_ENABLED', {
      env: { SERVER_TARGET: 'beta' },
      exposureOverride: { beta: false },
    });
    assert.equal(status.available, false);
    assert.equal(status.reason, CAPABILITY_REASON.REGISTRY_DISABLED);
  });

  it('returns deployment_disabled when beta exposure is on but deployment env is off', () => {
    const status = resolveCapabilityAvailability('TSTM_GENERATION_ENABLED', {
      env: { SERVER_TARGET: 'beta' },
    });
    assert.equal(status.available, false);
    assert.equal(status.reason, CAPABILITY_REASON.DEPLOYMENT_DISABLED);
  });

  it('returns emergency_disabled when the override env is set', () => {
    const status = resolveCapabilityAvailability('TSTM_GENERATION_ENABLED', {
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      },
      exposureOverride: { beta: true },
    });
    assert.equal(status.available, false);
    assert.equal(status.reason, CAPABILITY_REASON.EMERGENCY_DISABLED);
  });

  it('returns deployment_disabled when the deployment env switch is off', () => {
    const status = resolveCapabilityAvailability('TSTM_GENERATION_ENABLED', {
      env: { SERVER_TARGET: 'beta' },
      exposureOverride: { beta: true },
    });
    assert.equal(status.available, false);
    assert.equal(status.reason, CAPABILITY_REASON.DEPLOYMENT_DISABLED);
  });

  it('returns available when registry exposure and deployment env are both enabled', () => {
    const status = resolveCapabilityAvailability('TSTM_GENERATION_ENABLED', {
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
      },
      exposureOverride: { beta: true },
    });
    assert.equal(status.available, true);
    assert.equal(status.reason, CAPABILITY_REASON.AVAILABLE);
  });

  it('returns public status only for registry-exposed server-backed capabilities', () => {
    const status = getPublicCapabilityStatus({
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      },
      exposureOverride: { beta: true },
    });

    assert.deepEqual(status, {
      capabilities: {
        TSTM_GENERATION_ENABLED: {
          available: false,
          reason: CAPABILITY_REASON.EMERGENCY_DISABLED,
        },
      },
    });
  });
});
