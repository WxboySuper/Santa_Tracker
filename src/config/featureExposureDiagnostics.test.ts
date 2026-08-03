import * as featureExposure from './featureExposure';
import {
  isFeatureExposureDiagnosticsEnabled,
  mapServerReasonToResolution,
  resolveAllFeatureExposureDiagnostics,
  resolveFeatureExposureDiagnostic,
  type FeatureExposureDiagnosticResolveOptions,
} from './featureExposureDiagnostics';
import type { CapabilityAvailabilityReason } from './serverCapabilityStatus';

const SERVER_BACKED_AUTO_TSTM = {
  exposure: { local: true, beta: true, staging: false, production: false },
  owner: 'WxboySuper',
  addedDate: '2026-06-20',
  temporary: true,
  removalCondition: 'Enable on beta when Auto-TSTM ships.',
  serverBacked: true as const,
  serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
  trackingIssue: 427,
};

const mockServerBackedAutoTstm = () => {
  jest.spyOn(featureExposure, 'getFeatureExposure').mockReturnValue(SERVER_BACKED_AUTO_TSTM);
  jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockReturnValue(true);
};

const resolveAutoTstmWithCapability = (
  capability: { available: boolean; reason: CapabilityAvailabilityReason },
  options: FeatureExposureDiagnosticResolveOptions = {}
) => {
  mockServerBackedAutoTstm();

  return resolveFeatureExposureDiagnostic('autoTstm', {
    buildTarget: 'beta',
    serverStatus: {
      loaded: true,
      capabilities: {
        TSTM_GENERATION_ENABLED: capability,
      },
    },
    ...options,
  });
};

describe('featureExposureDiagnostics', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;
  const originalDevMode = globalThis.__GFC_DEV_MODE__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
    globalThis.__GFC_DEV_MODE__ = originalDevMode;
    jest.restoreAllMocks();
  });

  test('mapServerReasonToResolution maps public server reasons', () => {
    expect(mapServerReasonToResolution('available')).toBe('available');
    expect(mapServerReasonToResolution('registry_disabled')).toBe('target_policy');
    expect(mapServerReasonToResolution('emergency_disabled')).toBe('emergency_disabled');
    expect(mapServerReasonToResolution('deployment_disabled')).toBe('deployment_disabled');
    expect(mapServerReasonToResolution('unknown')).toBe('server_capability_unavailable');
  });

  test('isFeatureExposureDiagnosticsEnabled is true only for local dev builds', () => {
    globalThis.__GFC_DEV_MODE__ = true;
    globalThis.__GFC_BUILD_TARGET__ = 'local';
    expect(isFeatureExposureDiagnosticsEnabled()).toBe(true);

    globalThis.__GFC_BUILD_TARGET__ = 'production';
    expect(isFeatureExposureDiagnosticsEnabled()).toBe(false);

    globalThis.__GFC_BUILD_TARGET__ = 'local';
    globalThis.__GFC_DEV_MODE__ = false;
    expect(isFeatureExposureDiagnosticsEnabled()).toBe(false);
  });

  test('resolves target_policy when the registry keeps a feature off', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('autoTstm', {
      buildTarget: 'local',
    });

    expect(diagnostic).toMatchObject({
      featureKey: 'autoTstm',
      buildTarget: 'local',
      registryExposed: false,
      resolvedExposed: false,
      reason: 'target_policy',
    });
    expect(diagnostic.serverCapability).toBeUndefined();
  });

  test('resolves available for permanently exposed non-server-backed features', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('exportMap', {
      buildTarget: 'production',
    });

    expect(diagnostic).toMatchObject({
      featureKey: 'exportMap',
      lifecycle: 'permanent',
      registryExposed: true,
      resolvedExposed: true,
      reason: 'available',
    });
  });

  test('resolves server-backed emergency_disabled from capability status', () => {
    const diagnostic = resolveAutoTstmWithCapability({
      available: false,
      reason: 'emergency_disabled',
    });

    expect(diagnostic).toMatchObject({
      registryExposed: true,
      resolvedExposed: false,
      reason: 'emergency_disabled',
      serverCapability: {
        key: 'TSTM_GENERATION_ENABLED',
        serverReason: 'emergency_disabled',
        agreesWithClient: true,
      },
    });
  });

  test('resolves server-backed deployment_disabled from capability status', () => {
    const diagnostic = resolveAutoTstmWithCapability({
      available: false,
      reason: 'deployment_disabled',
    });

    expect(diagnostic.reason).toBe('deployment_disabled');
    expect(diagnostic.resolvedExposed).toBe(false);
  });

  test('resolves server_capability_unavailable when capability status is missing', () => {
    mockServerBackedAutoTstm();

    const diagnostic = resolveFeatureExposureDiagnostic('autoTstm', {
      buildTarget: 'beta',
      serverStatus: {
        loaded: true,
        capabilities: {},
      },
    });

    expect(diagnostic).toMatchObject({
      resolvedExposed: false,
      reason: 'server_capability_unavailable',
      serverCapability: {
        key: 'TSTM_GENERATION_ENABLED',
        serverReason: 'unknown',
        agreesWithClient: true,
      },
    });
  });

  test('resolves server-backed available state', () => {
    const diagnostic = resolveAutoTstmWithCapability({
      available: true,
      reason: 'available',
    });

    expect(diagnostic).toMatchObject({
      resolvedExposed: true,
      reason: 'available',
    });
  });

  test('resolves entitlement when a feature requires premium access', () => {
    const diagnostic = resolveFeatureExposureDiagnostic('exportMap', {
      buildTarget: 'production',
      entitlementRequired: true,
      entitlement: { premiumActive: false },
    });

    expect(diagnostic).toMatchObject({
      resolvedExposed: false,
      reason: 'entitlement',
    });
  });

  test('marks server disagreement when entitlement blocks a server-available feature', () => {
    const diagnostic = resolveAutoTstmWithCapability(
      {
        available: true,
        reason: 'available',
      },
      {
        entitlementRequired: true,
        entitlement: { premiumActive: false },
      }
    );

    expect(diagnostic).toMatchObject({
      resolvedExposed: false,
      reason: 'entitlement',
      serverCapability: {
        agreesWithClient: false,
      },
    });
  });

  test('includes maintainer metadata only when requested', () => {
    const withMetadata = resolveFeatureExposureDiagnostic('autoTstm', {
      buildTarget: 'beta',
      includeInternalMetadata: true,
    });
    const withoutMetadata = resolveFeatureExposureDiagnostic('autoTstm', {
      buildTarget: 'beta',
      includeInternalMetadata: false,
    });

    expect(withMetadata.owner).toBe('WxboySuper');
    expect(withMetadata.trackingIssue).toBe(427);
    expect(withMetadata.removalCondition).toMatch(/Auto-TSTM/);
    expect(withoutMetadata.owner).toBeUndefined();
    expect(withoutMetadata.trackingIssue).toBeUndefined();
    expect(withoutMetadata.removalCondition).toBeUndefined();
  });

  test('resolveAllFeatureExposureDiagnostics returns stable feature-key order', () => {
    const diagnostics = resolveAllFeatureExposureDiagnostics({ buildTarget: 'production' });
    const featureKeys = diagnostics.map((entry) => entry.featureKey);

    expect(featureKeys).toEqual([...featureKeys].sort((left, right) => left.localeCompare(right)));
    expect(featureKeys).toContain('exportMap');
    expect(featureKeys).toContain('autoTstm');
  });
});
