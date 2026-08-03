'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isEmergencyDisabledCapability,
  isValidEmergencyDisableValue,
  logEmergencyCapabilityOverrides,
  parseEmergencyDisabledCapabilities,
} = require('./emergencyCapabilityOverrides');

const createLogSpy = () => {
  const entries = [];
  return {
    entries,
    log: {
      error(message) {
        entries.push({ level: 'error', message });
      },
      warn(message) {
        entries.push({ level: 'warn', message });
      },
      info(message) {
        entries.push({ level: 'info', message });
      },
    },
  };
};

describe('emergency capability overrides', () => {
  it('returns an empty disable set when the env var is unset', () => {
    const result = parseEmergencyDisabledCapabilities({});
    assert.deepEqual([...result.disabledKeys], []);
    assert.equal(result.malformed, false);
  });

  it('parses comma-separated known capability keys', () => {
    const result = parseEmergencyDisabledCapabilities({
      EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
    });
    assert.deepEqual([...result.disabledKeys], ['TSTM_GENERATION_ENABLED']);
  });

  it('ignores unknown keys without logging during per-request parsing', () => {
    const result = parseEmergencyDisabledCapabilities({
      EMERGENCY_DISABLED_CAPABILITIES: 'UNKNOWN,TSTM_GENERATION_ENABLED',
    });

    assert.deepEqual([...result.disabledKeys], ['TSTM_GENERATION_ENABLED']);
    assert.deepEqual(result.ignoredUnknownKeys, ['UNKNOWN']);
  });

  it('logs unknown keys only during startup logging', () => {
    const { log, entries } = createLogSpy();
    logEmergencyCapabilityOverrides(
      { EMERGENCY_DISABLED_CAPABILITIES: 'UNKNOWN,TSTM_GENERATION_ENABLED', SERVER_TARGET: 'beta' },
      { log }
    );

    assert.match(entries[0].message, /UNKNOWN/);
    assert.equal(entries[0].level, 'warn');
    assert.match(entries[1].message, /emergency_disabled=\["TSTM_GENERATION_ENABLED"\]/);
  });

  it('treats malformed sentinel values as zero emergency disables', () => {
    const result = parseEmergencyDisabledCapabilities(
      { EMERGENCY_DISABLED_CAPABILITIES: 'true' }
    );

    assert.deepEqual([...result.disabledKeys], []);
    assert.equal(result.malformed, true);
  });

  it('logs malformed override values only during startup logging', () => {
    const { log, entries } = createLogSpy();
    logEmergencyCapabilityOverrides(
      { EMERGENCY_DISABLED_CAPABILITIES: 'true', SERVER_TARGET: 'beta' },
      { log }
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 'error');
    assert.match(entries[0].message, /malformed EMERGENCY_DISABLED_CAPABILITIES/);
  });

  it('treats control characters as malformed', () => {
    assert.equal(isValidEmergencyDisableValue('TSTM\nGENERATION_ENABLED'), false);
  });

  it('reports emergency disable membership for known keys only', () => {
    assert.equal(
      isEmergencyDisabledCapability('TSTM_GENERATION_ENABLED', {
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      }),
      true
    );
    assert.equal(
      isEmergencyDisabledCapability('TSTM_GENERATION_ENABLED', {}),
      false
    );
  });
});
