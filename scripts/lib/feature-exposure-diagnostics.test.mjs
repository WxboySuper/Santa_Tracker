import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateFeatureExposureDiagnostics,
  mapServerReasonToResolution,
  resolveFeatureExposureDiagnostic,
  serializeFeatureExposureDiagnostics,
} from './feature-exposure-diagnostics.mjs';

const FIXTURE_REGISTRY = {
  exportMap: {
    exposure: { local: true, beta: true, staging: true, production: true },
    owner: 'WxboySuper',
    addedDate: '2026-06-21',
    temporary: false,
    serverBacked: false,
  },
  autoTstm: {
    exposure: { local: false, beta: true, staging: false, production: false },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Enable on beta when Auto-TSTM ships.',
    serverBacked: true,
    serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
    trackingIssue: 427,
  },
  premiumFixture: {
    exposure: { local: true, beta: true, staging: true, production: true },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Fixture entitlement gate.',
    serverBacked: false,
    entitlementRequired: true,
    trackingIssue: 999,
  },
};

describe('feature exposure diagnostics', () => {
  it('maps server reasons into resolution reasons', () => {
    assert.equal(mapServerReasonToResolution('registry_disabled'), 'target_policy');
    assert.equal(mapServerReasonToResolution('emergency_disabled'), 'emergency_disabled');
    assert.equal(mapServerReasonToResolution('deployment_disabled'), 'deployment_disabled');
    assert.equal(mapServerReasonToResolution('unknown'), 'server_capability_unavailable');
  });

  it('resolves target_policy for registry-disabled features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('autoTstm', FIXTURE_REGISTRY.autoTstm, {
      target: 'local',
      env: { SERVER_TARGET: 'local' },
      includeInternalMetadata: true,
    });

    assert.deepEqual(
      {
        reason: diagnostic.reason,
        resolvedExposed: diagnostic.resolvedExposed,
        registryExposed: diagnostic.registryExposed,
      },
      {
        reason: 'target_policy',
        resolvedExposed: false,
        registryExposed: false,
      }
    );
  });

  it('resolves emergency_disabled for exposed server-backed features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('autoTstm', FIXTURE_REGISTRY.autoTstm, {
      target: 'beta',
      env: {
        SERVER_TARGET: 'beta',
        TSTM_GENERATION_ENABLED: 'true',
        EMERGENCY_DISABLED_CAPABILITIES: 'TSTM_GENERATION_ENABLED',
      },
      includeInternalMetadata: true,
    });

    assert.equal(diagnostic.reason, 'emergency_disabled');
    assert.equal(diagnostic.resolvedExposed, false);
    assert.equal(diagnostic.serverCapability?.serverReason, 'emergency_disabled');
  });

  it('resolves deployment_disabled for exposed server-backed features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('autoTstm', FIXTURE_REGISTRY.autoTstm, {
      target: 'beta',
      env: { SERVER_TARGET: 'beta' },
      includeInternalMetadata: false,
    });

    assert.equal(diagnostic.reason, 'deployment_disabled');
    assert.equal(diagnostic.resolvedExposed, false);
  });

  it('resolves available for exposed non-server-backed features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('exportMap', FIXTURE_REGISTRY.exportMap, {
      target: 'production',
      env: { SERVER_TARGET: 'production' },
      includeInternalMetadata: false,
    });

    assert.equal(diagnostic.reason, 'available');
    assert.equal(diagnostic.resolvedExposed, true);
  });

  it('resolves entitlement for premium-gated fixture features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic(
      'premiumFixture',
      FIXTURE_REGISTRY.premiumFixture,
      {
        target: 'beta',
        env: { SERVER_TARGET: 'beta' },
        includeInternalMetadata: true,
        entitlement: { premiumActive: false },
      }
    );

    assert.equal(diagnostic.reason, 'entitlement');
    assert.equal(diagnostic.resolvedExposed, false);
    assert.equal(diagnostic.owner, 'WxboySuper');
  });

  it('generates deterministic JSON with stable feature ordering', () => {
    const report = generateFeatureExposureDiagnostics(
      { registry: FIXTURE_REGISTRY },
      {
        target: 'beta',
        env: { SERVER_TARGET: 'beta' },
        includeInternalMetadata: true,
      }
    );

    const serialized = serializeFeatureExposureDiagnostics(report);
    const reparsed = JSON.parse(serialized);

    assert.equal(reparsed.buildTarget, 'beta');
    assert.deepEqual(
      reparsed.features.map((entry) => entry.featureKey),
      ['autoTstm', 'exportMap', 'premiumFixture']
    );
    assert.equal(reparsed.features[0].reason, 'deployment_disabled');
    assert.equal(reparsed.features[1].reason, 'available');
    assert.equal(reparsed.features[2].reason, 'entitlement');
    assert.notEqual(reparsed.generatedAt, '1970-01-01T00:00:00.000Z');
    assert.match(serialized, /"generatedAt": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/);
  });

  it('strips maintainer metadata in public mode', () => {
    const report = generateFeatureExposureDiagnostics(
      { registry: FIXTURE_REGISTRY },
      {
        target: 'beta',
        env: { SERVER_TARGET: 'beta' },
        includeInternalMetadata: false,
      }
    );

    for (const diagnostic of report.features) {
      assert.equal(diagnostic.owner, undefined);
      assert.equal(diagnostic.trackingIssue, undefined);
      assert.equal(diagnostic.removalCondition, undefined);
    }
  });
});
