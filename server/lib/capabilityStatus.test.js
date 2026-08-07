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

  it('public status exposes only allowlisted fields (schema snapshot)', () => {
    const status = getPublicCapabilityStatus({
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
      },
      exposureOverride: { beta: true },
    });

    // Every serialized capability entry must be exactly { available, reason }.
    for (const entry of Object.values(status.capabilities)) {
      assert.deepEqual(Object.keys(entry).sort(), ['available', 'reason']);
      assert.equal(typeof entry.available, 'boolean');
      assert.equal(typeof entry.reason, 'string');
    }

    // The public envelope is exactly { capabilities: {...} }.
    assert.deepEqual(Object.keys(status).sort(), ['capabilities']);
  });

  it('never leaks internal fields into the public status', () => {
    const status = getPublicCapabilityStatus({
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      },
      exposureOverride: { beta: true },
    });

    // The public envelope is exactly { capabilities: { key: { available, reason } } }.
    // Internal implementation details must not appear as serialized keys or values.
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes('featureKey'), false);
    assert.equal(serialized.includes('exposureOverride'), false);
    assert.equal(serialized.includes('EMERGENCY_DISABLED_CAPABILITIES'), false);
    assert.equal(serialized.includes('serverCapabilityKey'), false);
  });
});
