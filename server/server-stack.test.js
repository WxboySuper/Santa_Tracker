'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureApp } = require('./analytics-app');

/** @param {import('node:http').Server} server */
const getServerPort = (server) => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port.');
  }
  return address.port;
};

/** @returns {Promise<import('node:http').Server>} */
const startTestAnalyticsServer = async () => {
  const express = require('express');
  const app = express();
  configureApp(app, express);

  return new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
};

describe('analytics server stack (express 5)', () => {
  const serverReady = startTestAnalyticsServer();

  after(async () => {
    const server = await serverReady;
    server.close();
  });

  it('serves billing config on GET /api/billing/config', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/billing/config`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.billingEnabled, 'boolean');
  });

  it('serves capability status on GET /api/capabilities/status', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/capabilities/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.capabilities, 'object');
  });

  it('does not expose the retired POST /collect telemetry endpoint', async () => {
    const server = await serverReady;
    const port = getServerPort(server);
    const response = await fetch(`http://127.0.0.1:${port}/collect`, { method: 'POST' });
    assert.equal(response.status, 404);
  });
});
