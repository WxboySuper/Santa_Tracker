import {
  FEATURE_EXPOSURE_REGISTRY,
  getFeatureExposure,
  getFeatureKeys,
  isFeatureExposed,
  isFeatureExposedOnTarget,
  validateFeatureExposureRegistry,
  type FeatureExposureDefinition,
  type FeatureKey,
  type TemporaryFeatureExposureDefinition,
} from './featureExposure';

const BASE_DEFINITION: TemporaryFeatureExposureDefinition = {
  exposure: { local: false, beta: false, staging: false, production: false },
  owner: 'WxboySuper',
  addedDate: '2026-06-20',
  temporary: true,
  removalCondition: 'Remove after launch.',
  serverBacked: false,
};

const expectRegistryValidationError = (
  overrides: Partial<TemporaryFeatureExposureDefinition> & Record<string, unknown>,
  pattern: RegExp
): void => {
  expect(() =>
    validateFeatureExposureRegistry({
      sample: { ...BASE_DEFINITION, ...overrides } as FeatureExposureDefinition,
    })
  ).toThrow(pattern);
};

describe('featureExposure registry', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  });

  test('validates every declared feature and lifecycle field', () => {
    expect(() => validateFeatureExposureRegistry()).not.toThrow();
  });

  test.each([
    ['temporary features without removal metadata', { removalCondition: '   ' }, /removalCondition/],
    ['server-backed features without capability keys', { serverBacked: true }, /serverCapabilityKey/],
    [
      'non-server-backed features with capability keys',
      { serverBacked: false, serverCapabilityKey: 'TSTM_GENERATION_ENABLED' },
      /serverCapabilityKey/,
    ],
    ['added dates with impossible calendar values', { addedDate: '2026-13-40' }, /addedDate/],
  ] as const)('rejects %s', (_label, overrides, pattern) => {
    expectRegistryValidationError(overrides, pattern);
  });

  test('lists every registry key in typed order', () => {
    expect(getFeatureKeys()).toEqual([
      'exportMap',
      'saveLoad',
      'tornadoOutlook',
      'windOutlook',
      'hailOutlook',
      'categoricalOutlook',
      'significantThreats',
      'autoTstm',
      'forecastWorkflowV2',
      'verificationRelaunch',
      'customProducts',
      'tropicalWorkspace',
      'collaborationRoom',
    ]);
  });

  test('returns registry metadata for a known feature key', () => {
    expect(getFeatureExposure('autoTstm')).toMatchObject({
      serverBacked: true,
      serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
      trackingIssue: 427,
    });
  });

  test.each(['local', 'beta', 'staging', 'production'] as const)(
    'reports exposure for autoTstm on %s from the registry matrix',
    (target) => {
      expect(isFeatureExposedOnTarget('autoTstm', target)).toBe(
        FEATURE_EXPOSURE_REGISTRY.autoTstm.exposure[target]
      );
    }
  );

  test('defaults exposure checks to the embedded build target', () => {
    globalThis.__GFC_BUILD_TARGET__ = 'beta';
    expect(isFeatureExposed('collaborationRoom')).toBe(false);
  });

  test('keeps core product capabilities enabled on every target', () => {
    const coreProductKeys = [
      'exportMap',
      'saveLoad',
      'tornadoOutlook',
      'windOutlook',
      'hailOutlook',
      'categoricalOutlook',
      'significantThreats',
    ] as const;

    for (const feature of coreProductKeys) {
      for (const target of ['local', 'beta', 'staging', 'production'] as const) {
        expect(isFeatureExposedOnTarget(feature, target)).toBe(true);
      }
    }
  });

  test('keeps unreleased v1.7 workstreams disabled outside their explicitly approved targets', () => {
    const workstreamKeys = [
      'forecastWorkflowV2',
      'verificationRelaunch',
      'customProducts',
      'tropicalWorkspace',
      'collaborationRoom',
    ] as const;

    for (const feature of workstreamKeys.filter(
      (feature) => !['forecastWorkflowV2', 'customProducts', 'verificationRelaunch'].includes(feature)
    )) {
      for (const target of ['local', 'beta', 'staging', 'production'] as const) {
        expect(isFeatureExposedOnTarget(feature, target)).toBe(false);
      }
    }

    // verificationRelaunch dogfoods on local only; beta/staging/production stay off.
    expect(isFeatureExposedOnTarget('verificationRelaunch', 'local')).toBe(true);
    for (const target of ['beta', 'staging', 'production'] as const) {
      expect(isFeatureExposedOnTarget('verificationRelaunch', target)).toBe(false);
    }

    expect(isFeatureExposedOnTarget('forecastWorkflowV2', 'local')).toBe(true);
    expect(isFeatureExposedOnTarget('forecastWorkflowV2', 'beta')).toBe(true);
    expect(isFeatureExposedOnTarget('forecastWorkflowV2', 'staging')).toBe(false);
    expect(isFeatureExposedOnTarget('forecastWorkflowV2', 'production')).toBe(false);

    expect(isFeatureExposedOnTarget('customProducts', 'local')).toBe(true);
    expect(isFeatureExposedOnTarget('customProducts', 'beta')).toBe(true);
    for (const target of ['staging', 'production'] as const) {
      expect(isFeatureExposedOnTarget('customProducts', target)).toBe(false);
    }

    for (const target of ['local', 'staging', 'production'] as const) {
      expect(isFeatureExposedOnTarget('autoTstm', target)).toBe(false);
    }
    expect(isFeatureExposedOnTarget('autoTstm', 'beta')).toBe(true);
  });

  test('only autoTstm is server-backed in the initial registry', () => {
    for (const feature of getFeatureKeys()) {
      const definition = getFeatureExposure(feature);
      if (feature === 'autoTstm') {
        expect(definition.serverBacked).toBe(true);
        expect(definition.serverCapabilityKey).toBe('TSTM_GENERATION_ENABLED');
      } else {
        expect(definition.serverBacked).toBe(false);
        expect(definition.serverCapabilityKey).toBeUndefined();
      }
    }
  });

  test('keeps server capability metadata aligned with the analytics registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      KNOWN_SERVER_CAPABILITY_KEYS,
      SERVER_FEATURE_EXPOSURE_REGISTRY,
    } = require('../../server/lib/serverFeatureExposure');

    const clientBackedKeys = getFeatureKeys()
      .filter((feature) => getFeatureExposure(feature).serverBacked)
      .map((feature) => ({
        feature,
        definition: getFeatureExposure(feature),
      }));

    expect(clientBackedKeys).toHaveLength(1);
    expect(KNOWN_SERVER_CAPABILITY_KEYS).toEqual(['TSTM_GENERATION_ENABLED']);

    for (const { feature, definition } of clientBackedKeys) {
      const serverDefinition = SERVER_FEATURE_EXPOSURE_REGISTRY[feature];
      expect(serverDefinition).toBeDefined();
      expect(serverDefinition.serverCapabilityKey).toBe(definition.serverCapabilityKey);
      expect(serverDefinition.exposure).toEqual(definition.exposure);
    }
  });
});

type ExpectFalse<T extends false> = T;

type UnknownFeatureKeyRejected = 'notRegistered' extends FeatureKey ? true : false;

// Compile-time guard: unknown registry keys must not type-check at call sites.
type _unknownFeatureKeyMustFail = ExpectFalse<UnknownFeatureKeyRejected>;
