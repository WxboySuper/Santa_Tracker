'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertCapabilityRouteRejectsWithoutWork,
  assertPublicCapabilityStatus,
  assertPublicCapabilityStatusSurface,
  createTestAppWithGate,
  disabledCapabilityStatusFixtures,
  getServerUrl,
  startTestServer,
} = require('./featureExposureHarness');
const { CAPABILITY_REASON } = require('../lib/capabilityStatus');
const { DISABLED_CAPABILITY_STATUS } = require('../lib/featureCapabilities');

describe('feature exposure server harness', () => {
  it('creates a gated test app that rejects without invoking handlers', async () => {
    await assertCapabilityRouteRejectsWithoutWork({
      capabilityKey: 'TSTM_GENERATION_ENABLED',
      env: { SERVER_TARGET: 'beta' },
      routeOptions: { exposureOverride: { beta: false } },
      expectedBody: {
        error: 'Auto-TSTM is not enabled on this deployment.',
      },
    });
  });

  it('exposes canned disabled capability status fixtures', () => {
    assertPublicCapabilityStatus('TSTM_GENERATION_ENABLED', {
      env: disabledCapabilityStatusFixtures.registry_disabled.env,
      routeOptions: disabledCapabilityStatusFixtures.registry_disabled.routeOptions,
      reason: CAPABILITY_REASON.REGISTRY_DISABLED,
    });

    assertPublicCapabilityStatus('TSTM_GENERATION_ENABLED', {
      env: disabledCapabilityStatusFixtures.available.env,
      routeOptions: disabledCapabilityStatusFixtures.available.routeOptions,
      reason: CAPABILITY_REASON.AVAILABLE,
    });
  });

  it('starts a test server for custom gate assertions', async () => {
    let calls = 0;
    const app = createTestAppWithGate(
      'TSTM_GENERATION_ENABLED',
      () => {
        calls += 1;
      },
      {
        env: {
          SERVER_TARGET: 'beta',
          TSTM_GENERATION_ENABLED: 'true',
        },
        exposureOverride: { beta: true },
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

  it('maps emergency disable fixtures to the expected public status', () => {
    const fixture = disabledCapabilityStatusFixtures.emergency_disabled;
    assertPublicCapabilityStatusSurface('TSTM_GENERATION_ENABLED', fixture);
    assert.equal(fixture.reason, CAPABILITY_REASON.EMERGENCY_DISABLED);
    assert.equal(DISABLED_CAPABILITY_STATUS, 404);
  });
});
