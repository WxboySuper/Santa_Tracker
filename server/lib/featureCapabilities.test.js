'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CAPABILITY_REASON,
  DISABLED_CAPABILITY_STATUS,
  createServerCapabilityGate,
  getServerCapabilityDisableReason,
  isServerCapabilityEnabled,
  sendDisabledCapabilityResponse,
} = require('./featureCapabilities');
const {
  assertCapabilityRouteRejectsWithoutWork,
  createTestAppWithGate,
  disabledCapabilityStatusFixtures,
  getServerUrl,
  startTestServer,
} = require('../testing/featureExposureHarness');
const { allTargetsEnabledRouteOptions } = require('../testing/featureExposureTargetMatrix');

describe('server capability gates', () => {
  it('stays disabled for unknown capability keys', () => {
    assert.equal(
      isServerCapabilityEnabled('UNKNOWN_CAPABILITY', { env: { UNKNOWN_CAPABILITY: 'true' } }),
      false
    );
  });

  it('requires registry exposure and deployment env to both be enabled', () => {
    const env = { TSTM_GENERATION_ENABLED: 'true', SERVER_TARGET: 'beta' };
    assert.equal(isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', { env }), true);

    assert.equal(
      isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', {
        env: { SERVER_TARGET: 'beta' },
        exposureOverride: { beta: true },
      }),
      false
    );

    assert.equal(
      isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', {
        env,
        exposureOverride: { beta: false },
      }),
      false
    );
  });

  it('emergency disable overrides registry exposure and deployment env', () => {
    const fixture = disabledCapabilityStatusFixtures.emergency_disabled;

    assert.equal(
      isServerCapabilityEnabled('TSTM_GENERATION_ENABLED', {
        env: fixture.env,
        exposureOverride: fixture.routeOptions.exposureOverride,
      }),
      false
    );
    assert.equal(
      getServerCapabilityDisableReason('TSTM_GENERATION_ENABLED', {
        env: fixture.env,
        exposureOverride: fixture.routeOptions.exposureOverride,
      }),
      CAPABILITY_REASON.EMERGENCY_DISABLED
    );
  });

  it('logs emergency rejections without invoking handlers', async () => {
    const fixture = disabledCapabilityStatusFixtures.emergency_disabled;
    const logEntries = [];
    let calls = 0;
    const app = createTestAppWithGate(
      'TSTM_GENERATION_ENABLED',
      () => {
        calls += 1;
      },
      {
        env: fixture.env,
        exposureOverride: fixture.routeOptions.exposureOverride,
        log: {
          info(message) {
            logEntries.push(message);
          },
        },
      }
    );
    const server = await startTestServer(app);

    try {
      const response = await fetch(getServerUrl(server), { method: 'POST' });
      assert.equal(response.status, DISABLED_CAPABILITY_STATUS);
      assert.equal(calls, 0);
      assert.match(logEntries[0], /reason=emergency_disabled/);
    } finally {
      server.close();
    }
  });

  it('rejects disabled capabilities before handlers run', async () => {
    await assertCapabilityRouteRejectsWithoutWork({
      capabilityKey: 'TSTM_GENERATION_ENABLED',
      env: { TSTM_GENERATION_ENABLED: 'true', SERVER_TARGET: 'beta' },
      routeOptions: { exposureOverride: { beta: false } },
      expectedBody: {
        error: 'Auto-TSTM is not enabled on this deployment.',
      },
    });
  });

  it('fails route registration when SERVER_TARGET is invalid', () => {
    assert.throws(
      () =>
        createServerCapabilityGate('TSTM_GENERATION_ENABLED', {
          env: { SERVER_TARGET: 'preview' },
        }),
      /Invalid SERVER_TARGET/
    );
  });

  it('uses a consistent disabled response helper', () => {
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
      },
    };

    sendDisabledCapabilityResponse(response, { label: 'Auto-TSTM' });
    assert.equal(response.statusCode, DISABLED_CAPABILITY_STATUS);
    assert.deepEqual(response.body, {
      error: 'Auto-TSTM is not enabled on this deployment.',
    });
  });

  it('allows handlers when registry exposure and deployment env are enabled', async () => {
    let calls = 0;
    const app = createTestAppWithGate(
      'TSTM_GENERATION_ENABLED',
      () => {
        calls += 1;
      },
      {
        env: {
          TSTM_GENERATION_ENABLED: 'true',
          SERVER_TARGET: 'beta',
        },
        ...allTargetsEnabledRouteOptions(),
      }
    );
    const server = await startTestServer(app);

    try {
      const response = await fetch(getServerUrl(server), { method: 'POST' });
      assert.equal(response.status, 200);
      assert.equal(calls, 1);
    } finally {
      server.close();
    }
  });
});
