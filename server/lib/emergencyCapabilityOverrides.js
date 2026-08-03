'use strict';

const { KNOWN_SERVER_CAPABILITY_KEYS } = require('./serverFeatureExposure');

const EMERGENCY_DISABLED_ENV_KEY = 'EMERGENCY_DISABLED_CAPABILITIES';
const KNOWN_CAPABILITY_KEY_SET = new Set(KNOWN_SERVER_CAPABILITY_KEYS);
const MALFORMED_SENTINEL_VALUES = new Set(['true', 'false']);

/** Returns true when the value contains ASCII control characters. */
const hasControlCharacters = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
};

/** Returns the default emergency override parse result. */
const emptyParseResult = (malformed = false) => ({
  disabledKeys: new Set(),
  malformed,
  ignoredUnknownKeys: [],
});

/** Returns true when the raw env value is safe to parse as a disable list. */
const isValidEmergencyDisableValue = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (MALFORMED_SENTINEL_VALUES.has(trimmed.toLowerCase())) {
    return false;
  }

  return !hasControlCharacters(trimmed);
};

/** Collects validated disable keys from a comma-separated env value. */
const collectEmergencyDisabledKeys = (rawValue) => {
  const disabledKeys = new Set();
  const ignoredUnknownKeys = [];

  for (const entry of rawValue.split(',')) {
    const capabilityKey = entry.trim();
    if (!capabilityKey) {
      continue;
    }

    if (!KNOWN_CAPABILITY_KEY_SET.has(capabilityKey)) {
      ignoredUnknownKeys.push(capabilityKey);
      continue;
    }

    disabledKeys.add(capabilityKey);
  }

  return { disabledKeys, ignoredUnknownKeys };
};

/** Logs ignored unknown keys from the emergency disable env var. */
const logUnknownEmergencyDisableKeys = (ignoredUnknownKeys, log) => {
  for (const capabilityKey of ignoredUnknownKeys) {
    log.warn?.(
      `[capabilities] ignoring unknown emergency disable key ${JSON.stringify(capabilityKey)}`
    );
  }
};

/**
 * Parses EMERGENCY_DISABLED_CAPABILITIES into a validated disable set.
 * Malformed values fail closed by applying zero emergency disables.
 */
const parseEmergencyDisabledCapabilities = (env = process.env) => {
  const rawValue = env[EMERGENCY_DISABLED_ENV_KEY];

  if (rawValue === undefined || rawValue === '') {
    return emptyParseResult();
  }

  if (!isValidEmergencyDisableValue(rawValue)) {
    return emptyParseResult(true);
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return emptyParseResult();
  }

  const { disabledKeys, ignoredUnknownKeys } = collectEmergencyDisabledKeys(trimmed);

  return {
    disabledKeys,
    malformed: false,
    ignoredUnknownKeys,
  };
};

/** Returns true when a capability key is emergency-disabled for this deployment. */
const isEmergencyDisabledCapability = (capabilityKey, env = process.env) => {
  const { disabledKeys } = parseEmergencyDisabledCapabilities(env);
  return disabledKeys.has(capabilityKey);
};

/** Logs active emergency disable overrides once at startup. */
const logEmergencyCapabilityOverrides = (env = process.env, options = {}) => {
  const log = options.log || console;
  const target = options.target || env.SERVER_TARGET || 'local';
  const { disabledKeys, malformed, ignoredUnknownKeys } = parseEmergencyDisabledCapabilities(env);

  if (malformed) {
    log.error?.(
      `[capabilities] malformed ${EMERGENCY_DISABLED_ENV_KEY}; applying zero emergency disables`
    );
    return;
  }

  logUnknownEmergencyDisableKeys(ignoredUnknownKeys, log);

  const disabledList = [...disabledKeys].sort();
  if (disabledList.length === 0) {
    return;
  }

  log.info?.(
    `[capabilities] emergency_disabled=${JSON.stringify(disabledList)} target=${target}`
  );
};

module.exports = {
  EMERGENCY_DISABLED_ENV_KEY,
  isEmergencyDisabledCapability,
  isValidEmergencyDisableValue,
  logEmergencyCapabilityOverrides,
  parseEmergencyDisabledCapabilities,
};
