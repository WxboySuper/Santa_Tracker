'use strict';

const express = require('express');
const assert = require('node:assert/strict');
const {
  CAPABILITY_REASON,
  getPublicCapabilityStatus,
  resolveCapabilityAvailability,
} = require('../lib/capabilityStatus');
const {
  DISABLED_CAPABILITY_STATUS,
  createServerCapabilityGate,
} = require('../lib/featureCapabilities');
const { allTargetsEnabledRouteOptions } = require('./featureExposureTargetMatrix');

/** Starts a test HTTP server and returns its base URL. */
const startTestServer = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });

const getServerUrl = (server, path = '/api/test') => {
  const address = server.address();
  return `http://127.0.0.1:${address.port}${path}`;
};

/** Creates a minimal Express app with one gated route and handler spy. */
const createTestAppWithGate = (capabilityKey, handlerSpy, options = {}) => {
  const gate = createServerCapabilityGate(capabilityKey, options);
  const app = express();
  app.post(options.path || '/api/test', gate, (_req, res) => {
    handlerSpy();
    res.status(200).json({ ok: true });
  });
  return app;
};

/** Asserts a gated route rejects requests without invoking downstream work. */
const assertCapabilityRouteRejectsWithoutWork = async ({
  capabilityKey,
  env,
  routeOptions = {},
  path = '/api/test',
  method = 'POST',
  expectedStatus = DISABLED_CAPABILITY_STATUS,
  expectedBody,
}) => {
  let calls = 0;
  const app = createTestAppWithGate(
    capabilityKey,
    () => {
      calls += 1;
    },
    { env, path, ...routeOptions }
  );
  const server = await startTestServer(app);

  try {
    const response = await fetch(getServerUrl(server, path), { method });
    assert.equal(response.status, expectedStatus);
    if (expectedBody) {
      assert.deepEqual(await response.json(), expectedBody);
    }
    assert.equal(calls, 0);
  } finally {
    server.close();
  }
};

const disabledCapabilityStatusFixtures = {
  registry_disabled: {
    env: { SERVER_TARGET: 'beta' },
    routeOptions: { exposureOverride: { beta: false } },
    reason: CAPABILITY_REASON.REGISTRY_DISABLED,
  },
  deployment_disabled: {
    env: { SERVER_TARGET: 'beta' },
    routeOptions: { exposureOverride: { beta: true } },
    reason: CAPABILITY_REASON.DEPLOYMENT_DISABLED,
  },
  emergency_disabled: {
    env: {
      SERVER_TARGET: 'beta',
      TSTM_GENERATION_ENABLED: 'true',
      EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
    },
    routeOptions: allTargetsEnabledRouteOptions(),
    reason: CAPABILITY_REASON.EMERGENCY_DISABLED,
  },
  available: {
    env: {
      SERVER_TARGET: 'beta',
      TSTM_GENERATION_ENABLED: 'true',
    },
    routeOptions: allTargetsEnabledRouteOptions(),
    reason: CAPABILITY_REASON.AVAILABLE,
  },
};

/** Asserts capability availability for one capability key and fixture. */
const assertPublicCapabilityStatus = (capabilityKey, fixture) => {
  const status = resolveCapabilityAvailability(capabilityKey, {
    env: fixture.env,
    exposureOverride: fixture.routeOptions?.exposureOverride,
  });

  assert.equal(status.available, fixture.reason === CAPABILITY_REASON.AVAILABLE);
  assert.equal(status.reason, fixture.reason);
};

/** Asserts registry-exposed capabilities appear in the public status payload. */
const assertPublicCapabilityStatusSurface = (capabilityKey, fixture) => {
  const status = getPublicCapabilityStatus({
    env: fixture.env,
    exposureOverride: fixture.routeOptions?.exposureOverride,
  });

  assert.deepEqual(status.capabilities[capabilityKey], {
    available: fixture.reason === CAPABILITY_REASON.AVAILABLE,
    reason: fixture.reason,
  });
};

module.exports = {
  assertCapabilityRouteRejectsWithoutWork,
  assertPublicCapabilityStatus,
  assertPublicCapabilityStatusSurface,
  createTestAppWithGate,
  disabledCapabilityStatusFixtures,
  getServerUrl,
  startTestServer,
};
