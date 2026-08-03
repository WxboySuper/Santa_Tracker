'use strict';

const { getServerTarget } = require('./serverTarget');
const {
  CAPABILITY_REASON,
  findFeatureByCapabilityKey,
  isDeploymentCapabilityEnabled,
  resolveCapabilityAvailability,
} = require('./capabilityStatus');
const { isEmergencyDisabledCapability } = require('./emergencyCapabilityOverrides');

const DISABLED_CAPABILITY_STATUS = 404;

/**
 * Returns true when registry exposure, deployment env, and emergency overrides all allow use.
 * Authorization is intentionally separate and must run after this gate.
 */
const isServerCapabilityEnabled = (capabilityKey, options = {}) => {
  const status = resolveCapabilityAvailability(capabilityKey, options);
  return status.available;
};

/** Returns the disable reason for a capability on the current deployment target. */
const getServerCapabilityDisableReason = (capabilityKey, options = {}) =>
  resolveCapabilityAvailability(capabilityKey, options).reason;

/** Sends the standard fail-closed response for disabled experimental APIs. */
const sendDisabledCapabilityResponse = (res, { label }) => {
  res.status(DISABLED_CAPABILITY_STATUS).json({
    error: `${label} is not enabled on this deployment.`,
  });
};

/** Logs emergency rejections for audit without exposing secrets. */
const logEmergencyGateRejection = (capabilityKey, reason, log) => {
  if (reason !== CAPABILITY_REASON.EMERGENCY_DISABLED) {
    return;
  }

  log.info?.(
    `[capabilities] rejected capability=${capabilityKey} reason=${reason}`
  );
};

/** Rejects disabled capabilities before route handlers, auth, or expensive work run. */
const createServerCapabilityGate = (capabilityKey, options = {}) => {
  const env = options.env || process.env;
  const feature = findFeatureByCapabilityKey(capabilityKey);
  const label = options.label || feature?.definition?.label || 'This capability';
  const target = options.target ?? getServerTarget(env);
  const log = options.log || console;

  return (_req, res, next) => {
    const gateOptions = {
      env,
      target,
      exposureOverride: options.exposureOverride,
      log,
    };

    if (isServerCapabilityEnabled(capabilityKey, gateOptions)) {
      next();
      return;
    }

    const reason = getServerCapabilityDisableReason(capabilityKey, gateOptions);
    logEmergencyGateRejection(capabilityKey, reason, log);
    sendDisabledCapabilityResponse(res, { label });
  };
};

module.exports = {
  CAPABILITY_REASON,
  DISABLED_CAPABILITY_STATUS,
  createServerCapabilityGate,
  findFeatureByCapabilityKey,
  getServerCapabilityDisableReason,
  isDeploymentCapabilityEnabled,
  isEmergencyDisabledCapability,
  isServerCapabilityEnabled,
  sendDisabledCapabilityResponse,
};
