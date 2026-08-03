'use strict';

const { isEmergencyDisabledCapability } = require('./emergencyCapabilityOverrides');
const { SERVER_FEATURE_EXPOSURE_REGISTRY } = require('./serverFeatureExposure');
const { getServerTarget } = require('./serverTarget');

const CAPABILITY_REASON = {
  AVAILABLE: 'available',
  REGISTRY_DISABLED: 'registry_disabled',
  DEPLOYMENT_DISABLED: 'deployment_disabled',
  EMERGENCY_DISABLED: 'emergency_disabled',
  UNKNOWN: 'unknown',
};

/** Returns the server-backed feature entry for a capability key, if declared. */
const findFeatureByCapabilityKey = (capabilityKey) => {
  for (const [featureKey, definition] of Object.entries(SERVER_FEATURE_EXPOSURE_REGISTRY)) {
    if (definition.serverCapabilityKey === capabilityKey) {
      return { featureKey, definition };
    }
  }

  return null;
};

/** Returns true when ops explicitly enabled the deployment capability env switch. */
const isDeploymentCapabilityEnabled = (capabilityKey, env = process.env) =>
  env[capabilityKey] === 'true';

/** Resolves why a capability is unavailable on the current deployment target. */
const resolveCapabilityAvailability = (capabilityKey, options = {}) => {
  const env = options.env || process.env;
  const target = options.target ?? getServerTarget(env);
  const feature = findFeatureByCapabilityKey(capabilityKey);

  if (!feature) {
    return {
      available: false,
      reason: CAPABILITY_REASON.UNKNOWN,
    };
  }

  const exposureOverride = options.exposureOverride?.[target];
  const exposedOnTarget =
    typeof exposureOverride === 'boolean'
      ? exposureOverride
      : feature.definition.exposure[target] === true;

  if (!exposedOnTarget) {
    return {
      available: false,
      reason: CAPABILITY_REASON.REGISTRY_DISABLED,
    };
  }

  if (isEmergencyDisabledCapability(capabilityKey, env, options)) {
    return {
      available: false,
      reason: CAPABILITY_REASON.EMERGENCY_DISABLED,
    };
  }

  if (!isDeploymentCapabilityEnabled(capabilityKey, env)) {
    return {
      available: false,
      reason: CAPABILITY_REASON.DEPLOYMENT_DISABLED,
    };
  }

  return {
    available: true,
    reason: CAPABILITY_REASON.AVAILABLE,
  };
};

/** Returns public capability status for registry-exposed server-backed features. */
const getPublicCapabilityStatus = (options = {}) => {
  const env = options.env || process.env;
  const target = options.target ?? getServerTarget(env);
  const capabilities = {};

  for (const definition of Object.values(SERVER_FEATURE_EXPOSURE_REGISTRY)) {
    const exposureOverride = options.exposureOverride?.[target];
    const exposedOnTarget =
      typeof exposureOverride === 'boolean'
        ? exposureOverride
        : definition.exposure[target] === true;

    if (!exposedOnTarget) {
      continue;
    }

    const capabilityKey = definition.serverCapabilityKey;
    const status = resolveCapabilityAvailability(capabilityKey, options);
    capabilities[capabilityKey] = {
      available: status.available,
      reason: status.reason,
    };
  }

  return { capabilities };
};

module.exports = {
  CAPABILITY_REASON,
  findFeatureByCapabilityKey,
  getPublicCapabilityStatus,
  isDeploymentCapabilityEnabled,
  resolveCapabilityAvailability,
};
