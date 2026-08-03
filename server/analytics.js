'use strict';

const { initSentry } = require('./sentry');
const { configureApp } = require('./analytics-app');

/** Loads env vars, creates the Express app, and binds the analytics server. */
async function start() {
  const loadEnv = require('./load-env');
  await loadEnv();
  initSentry();

  const express = require('express');
  const PORT = parseInt(process.env.PORT || '3006', 10);

  const app = express();
  configureApp(app, express);
  const { logCapabilityStartupState } = require('./capabilities');
  logCapabilityStartupState(process.env);

  // Bind to loopback only — never exposed to the internet directly (nginx proxies in)
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[analytics] listening on 127.0.0.1:${PORT} (port ${PORT})`);
  });
}

start().catch((err) => {
  console.error('[analytics] startup failed:', err);
  process.exit(1);
});
