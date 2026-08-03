'use strict';

const BUILD_TARGETS = ['local', 'beta', 'staging', 'production'];

const ALL_TARGETS_OFF = {
  local: false,
  beta: false,
  staging: false,
  production: false,
};

const ALL_TARGETS_ON = {
  local: true,
  beta: true,
  staging: true,
  production: true,
};

/** Returns an exposureOverride object with one target set to the given value. */
const exposureOverrideFor = (target, enabled) => ({
  local: target === 'local' ? enabled : false,
  beta: target === 'beta' ? enabled : false,
  staging: target === 'staging' ? enabled : false,
  production: target === 'production' ? enabled : false,
});

/** Returns route options that enable a capability on every target. */
const allTargetsEnabledRouteOptions = () => ({
  exposureOverride: { ...ALL_TARGETS_ON },
});

module.exports = {
  ALL_TARGETS_OFF,
  ALL_TARGETS_ON,
  BUILD_TARGETS,
  allTargetsEnabledRouteOptions,
  exposureOverrideFor,
};
