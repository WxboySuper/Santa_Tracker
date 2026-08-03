'use strict';

const ALL_TARGETS_OFF = {
  local: false,
  beta: false,
  staging: false,
  production: false,
};

/**
 * Server-backed slice of the client feature exposure registry.
 * Keep aligned with src/config/featureExposure.ts; FND-06 adds CI drift checks.
 */
const SERVER_FEATURE_EXPOSURE_REGISTRY = {
  autoTstm: {
    serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
    exposure: { ...ALL_TARGETS_OFF, beta: true },
    label: 'Auto-TSTM',
  },
};

const KNOWN_SERVER_CAPABILITY_KEYS = Object.values(SERVER_FEATURE_EXPOSURE_REGISTRY).map(
  (definition) => definition.serverCapabilityKey
);

module.exports = {
  KNOWN_SERVER_CAPABILITY_KEYS,
  SERVER_FEATURE_EXPOSURE_REGISTRY,
};
