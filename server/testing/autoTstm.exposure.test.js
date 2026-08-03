'use strict';

const { describe, it } = require('node:test');
const express = require('express');
const { registerTstmRoutes } = require('../tstm');
const {
  assertCapabilityRouteRejectsWithoutWork,
  disabledCapabilityStatusFixtures,
} = require('./featureExposureHarness');
const startServer = (env, runGenerator, routeOptions = {}) => {
  const app = express();
  registerTstmRoutes(app, express, { env, runGenerator, ...routeOptions });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
};

const getLatestUrl = (server, query = '') => {
  const address = server.address();
  return `http://127.0.0.1:${address.port}/api/tstm/latest${query}`;
};

/** Asserts the latest route rejects without invoking the generator. */
const assertLatestRouteRejectsWithoutWork = async ({ env, routeOptions = {}, expectedBody }) => {
  let calls = 0;
  const server = await startServer(
    env,
    async () => {
      calls += 1;
      return {};
    },
    routeOptions
  );

  try {
    const response = await fetch(getLatestUrl(server, '?day=1&period=full'));
    const assert = require('node:assert/strict');
    assert.equal(response.status, 404);
    if (expectedBody) {
      assert.deepEqual(await response.json(), expectedBody);
    }
    assert.equal(calls, 0);
  } finally {
    server.close();
  }
};

describe('autoTstm exposure contract', () => {
  it('rejects latest requests for registry-disabled fixtures', async () => {
    await assertLatestRouteRejectsWithoutWork({
      env: disabledCapabilityStatusFixtures.registry_disabled.env,
      routeOptions: disabledCapabilityStatusFixtures.registry_disabled.routeOptions,
      expectedBody: {
        error: 'Auto-TSTM is not enabled on this deployment.',
      },
    });
  });

  it('rejects latest requests when only deployment env is enabled', async () => {
    await assertLatestRouteRejectsWithoutWork({
      env: { TSTM_GENERATION_ENABLED: 'true', SERVER_TARGET: 'local' },
    });
  });

  it('rejects latest requests for emergency-disabled fixtures', async () => {
    await assertLatestRouteRejectsWithoutWork({
      env: disabledCapabilityStatusFixtures.emergency_disabled.env,
      routeOptions: disabledCapabilityStatusFixtures.emergency_disabled.routeOptions,
      expectedBody: {
        error: 'Auto-TSTM is not enabled on this deployment.',
      },
    });
  });

  it('rejects generic gated routes through the shared harness', async () => {
    await assertCapabilityRouteRejectsWithoutWork({
      capabilityKey: 'TSTM_GENERATION_ENABLED',
      env: {},
      expectedBody: {
        error: 'Auto-TSTM is not enabled on this deployment.',
      },
    });
  });
});
