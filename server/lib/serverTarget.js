'use strict';

const SERVER_TARGETS = ['local', 'beta', 'staging', 'production'];

/** Returns true when the value is a known deployment target. */
const isServerTarget = (value) => SERVER_TARGETS.includes(value);

/**
 * Resolves a deployment target from an explicit env value.
 * Omitted values default to local development.
 */
const resolveServerTarget = (value) => {
  if (value === undefined || value === '') {
    return 'local';
  }

  if (isServerTarget(value)) {
    return value;
  }

  throw new Error(
    `Invalid SERVER_TARGET ${JSON.stringify(value)}. Expected one of: ${SERVER_TARGETS.join(', ')}.`
  );
};

/**
 * Resolves the analytics server deployment target.
 * SERVER_TARGET wins; SENTRY_ENVIRONMENT is a transitional fallback for hosted env files.
 */
const getServerTarget = (env = process.env) => {
  if (env.SERVER_TARGET !== undefined && env.SERVER_TARGET !== '') {
    return resolveServerTarget(env.SERVER_TARGET);
  }

  if (env.SENTRY_ENVIRONMENT !== undefined && env.SENTRY_ENVIRONMENT !== '') {
    if (isServerTarget(env.SENTRY_ENVIRONMENT)) {
      return env.SENTRY_ENVIRONMENT;
    }
  }

  return 'local';
};

module.exports = {
  SERVER_TARGETS,
  getServerTarget,
  isServerTarget,
  resolveServerTarget,
};
