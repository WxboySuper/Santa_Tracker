'use strict';

const { setupExpressErrorHandler } = require('./sentry');

/** Registers middleware and the hosted product routes. */
function configureApp(app, express) {
  const rateLimit = require('express-rate-limit');
  const { registerBetaRoutes } = require('./beta');
  const { registerAccountLifecycleRoutes } = require('./account-lifecycle');
  const { registerBillingRoutes } = require('./billing');
  const { registerCapabilityRoutes } = require('./capabilities');
  const { registerMetricsRoutes } = require('./metrics');
  const { registerSentryTunnelRoutes } = require('./sentry-tunnel');
  const { registerTstmIngestion, registerTstmRoutes } = require('./tstm');

  app.set('trust proxy', 'loopback');

  registerSentryTunnelRoutes(app, express, rateLimit);
  registerBillingRoutes(app, express);
  registerMetricsRoutes(app, express);
  registerBetaRoutes(app, express);
  registerCapabilityRoutes(app);
  registerTstmRoutes(app, express);
  registerTstmIngestion(app, express);
  registerAccountLifecycleRoutes(app, express);

  setupExpressErrorHandler(app);

  // Reject everything else quietly
  app.use((_req, res) => res.status(404).end());
}

module.exports = {
  configureApp,
};
