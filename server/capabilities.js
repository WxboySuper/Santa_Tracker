'use strict';

const rateLimit = require('express-rate-limit');
const { getPublicCapabilityStatus } = require('./lib/capabilityStatus');
const { logEmergencyCapabilityOverrides } = require('./lib/emergencyCapabilityOverrides');
const { getServerTarget } = require('./lib/serverTarget');

const CAPABILITY_STATUS_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Registers the public capability status endpoint for server-backed features. */
const registerCapabilityRoutes = (app, options = {}) => {
  const env = options.env || process.env;

  app.get('/api/capabilities/status', CAPABILITY_STATUS_RATE_LIMIT, (_req, res) => {
    res.status(200).json(getPublicCapabilityStatus({
      env,
      target: options.target,
    }));
  });
};

/** Logs active emergency disable overrides once during server startup. */
const logCapabilityStartupState = (env = process.env) => {
  logEmergencyCapabilityOverrides(env, { target: getServerTarget(env) });
};

module.exports = {
  CAPABILITY_STATUS_RATE_LIMIT,
  logCapabilityStartupState,
  registerCapabilityRoutes,
};
