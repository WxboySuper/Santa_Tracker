import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFeatureExposurePolicy } from './feature-exposure-policy.mjs';

const ALL_OFF = { local: false, beta: false, staging: false, production: false };
const ALL_ON = { local: true, beta: true, staging: true, production: true };

const validRegistry = {
  coreFeature: {
    exposure: { ...ALL_ON },
    owner: 'test',
    addedDate: '2026-06-20',
    temporary: false,
    serverBacked: false,
    trackingIssue: 100,
  },
  betaFeature: {
    exposure: { ...ALL_OFF },
    owner: 'test',
    addedDate: '2026-06-21',
    temporary: true,
    removalCondition: 'Remove after launch.',
    serverBacked: false,
    trackingIssue: 200,
  },
};

const emptySurfaces = { gatedRoutes: [], navigationItems: [] };

const v17WorkstreamRegistry = {
  autoTstm: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Enable on beta.', serverBacked: true, serverCapabilityKey: 'TSTM_GENERATION_ENABLED', trackingIssue: 427 },
  forecastWorkflowV2: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after v2.', serverBacked: false, trackingIssue: 429 },
  verificationRelaunch: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after relaunch.', serverBacked: false, trackingIssue: 430 },
  customProducts: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 431 },
  tropicalWorkspace: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Keep disabled.', serverBacked: false, trackingIssue: 432 },
  collaborationRoom: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 433 },
};

const v17Acknowledgements = {
  autoTstm: { reason: 'Covered by exemplar exposure tests', trackingIssue: 529 },
  tropicalWorkspace: { reason: 'Covered by route and nav tests', trackingIssue: 529 },
  collaborationRoom: { reason: 'Covered by route and nav tests', trackingIssue: 529 },
  forecastWorkflowV2: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
  verificationRelaunch: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
  customProducts: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
};

/** Asserts that a policy input fails with every expected message pattern. */
function assertPolicyErrors(registry, patterns, surfaces = emptySurfaces, options = {}) {
  const normalizedOptions = Array.isArray(options) ? { serverCapabilityKeys: options } : options;
  const result = evaluateFeatureExposurePolicy(registry, surfaces, normalizedOptions);
  assert.equal(result.ok, false);
  for (const pattern of patterns) assert.ok(result.errors.some((error) => pattern.test(error)));
}

describe('feature exposure policy', () => {
  it('passes for a valid registry with no surface references', () => {
    const result = evaluateFeatureExposurePolicy(validRegistry, emptySurfaces);
    assert.equal(result.ok, true);
  });

  it('fails when exposure matrix is missing a target', () => {
    const registry = {
      bad: {
        exposure: { local: false, beta: false },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/staging/, /production/]);
  });

  it('fails when addedDate is invalid', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-13-40',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/addedDate/]);
  });

  it('fails when temporary feature has no removalCondition', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: true,
        removalCondition: '   ',
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/removalCondition/]);
  });

  it('fails when server-backed feature has no capability key', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/serverCapabilityKey/]);
  });

  it('fails when non-server-backed feature has a capability key', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        serverCapabilityKey: 'SOME_KEY',
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/must not declare serverCapabilityKey/]);
  });

  it('fails when feature is missing trackingIssue', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
      },
    };
    assertPolicyErrors(registry, [/trackingIssue/]);
  });

  it('fails when trackingIssue is not a positive number', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: -5,
      },
    };
    assertPolicyErrors(registry, [/trackingIssue/]);
  });

  it('fails when gated route references unknown feature', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'nonExistent', path: '/foo' }],
      navigationItems: [],
    };
    assertPolicyErrors(validRegistry, [/nonExistent.*does not exist/], surfaces);
  });

  it('fails when navigation item references unknown feature', () => {
    const surfaces = {
      gatedRoutes: [],
      navigationItems: [{ id: 'foo', to: '/foo', label: 'Foo', feature: 'nonExistent' }],
    };
    assertPolicyErrors(validRegistry, [/nonExistent.*does not exist/], surfaces);
  });

  it('passes when surface references match registry keys and acknowledgements exist', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'betaFeature', path: '/beta' }],
      navigationItems: [{ id: 'nav', to: '/nav', label: 'Nav', feature: 'betaFeature' }],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces, {
      acknowledgements: {
        betaFeature: { reason: 'Covered by buildFeatureGatedRoutes.test.tsx', trackingIssue: 200 },
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails when server-backed feature capability key is not in server list', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/MY_FEATURE_ENABLED.*server capability keys/]);
  });

  it('passes when server-backed feature capability key matches server list', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, {
      serverCapabilityKeys: ['MY_FEATURE_ENABLED'],
      serverRegistry: {
        backed: {
          serverCapabilityKey: 'MY_FEATURE_ENABLED',
          exposure: { ...ALL_OFF },
        },
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails when temporary feature is exposed on production', () => {
    const registry = {
      prod: {
        exposure: { local: true, beta: true, staging: true, production: true },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: true,
        removalCondition: 'Remove after launch.',
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/prod.*production/]);
  });

  it('allows permanent features exposed on production', () => {
    const registry = {
      prod: {
        exposure: { local: true, beta: true, staging: true, production: true },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, true);
  });

  it('fails with multiple errors at once', () => {
    const registry = {
      bad: {
        exposure: {},
        owner: '',
        addedDate: 'not-a-date',
        temporary: true,
        removalCondition: '',
        serverBacked: true,
        trackingIssue: -1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 1);
  });

  it('passes for the current production registry shape', () => {
    const currentRegistry = {
      exportMap: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      saveLoad: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      tornadoOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      windOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      hailOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      categoricalOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      significantThreats: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      autoTstm: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Enable on beta.', serverBacked: true, serverCapabilityKey: 'TSTM_GENERATION_ENABLED', trackingIssue: 427 },
      forecastWorkflowV2: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after v2.', serverBacked: false, trackingIssue: 429 },
      verificationRelaunch: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after relaunch.', serverBacked: false, trackingIssue: 430 },
      customProducts: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 431 },
      tropicalWorkspace: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Keep disabled.', serverBacked: false, trackingIssue: 432 },
      collaborationRoom: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 433 },
    };
    const surfaces = {
      gatedRoutes: [
        { feature: 'tropicalWorkspace', path: 'tropical' },
        { feature: 'collaborationRoom', path: 'collaborate' },
      ],
      navigationItems: [
        { id: 'tropical', feature: 'tropicalWorkspace' },
        { id: 'collab', feature: 'collaborationRoom' },
      ],
    };
    const result = evaluateFeatureExposurePolicy(currentRegistry, surfaces, {
      serverCapabilityKeys: ['TSTM_GENERATION_ENABLED'],
      serverRegistry: {
        autoTstm: {
          serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
          exposure: { ...ALL_OFF },
          label: 'Auto-TSTM',
        },
      },
      sideEffectModules: { autoTstm: ['../utils/tstmGeneration'] },
      acknowledgements: {
        autoTstm: { reason: 'Covered by FeatureBoundary.test.tsx', trackingIssue: 427 },
        tropicalWorkspace: { reason: 'Covered by buildFeatureGatedRoutes.test.tsx', trackingIssue: 432 },
        collaborationRoom: { reason: 'Covered by buildFeatureGatedRoutes.test.tsx', trackingIssue: 433 },
        forecastWorkflowV2: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
        verificationRelaunch: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
        customProducts: { reason: 'Registry-only adoption acknowledgement', trackingIssue: 530 },
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails when side-effect module references unknown feature', () => {
    assertPolicyErrors(validRegistry, [/unknownFeature/], emptySurfaces, {
      sideEffectModules: { unknownFeature: ['../utils/example'] },
    });
  });

  it('fails when server registry feature is missing from client registry', () => {
    assertPolicyErrors(validRegistry, [/orphanServer.*missing from client/], emptySurfaces, {
      serverRegistry: {
        orphanServer: {
          serverCapabilityKey: 'ORPHAN_ENABLED',
          exposure: { ...ALL_OFF },
        },
      },
    });
  });

  it('ignores server registry entries without a serverCapabilityKey', () => {
    const result = evaluateFeatureExposurePolicy(validRegistry, emptySurfaces, {
      serverRegistry: {
        coreFeature: {
          exposure: { ...ALL_ON },
        },
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails when client server-backed feature is missing from server registry', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/missing from SERVER_FEATURE_EXPOSURE_REGISTRY/], emptySurfaces, {
      serverCapabilityKeys: ['MY_FEATURE_ENABLED'],
    });
  });

  it('fails when client and server exposure matrices disagree', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF, beta: true },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    assertPolicyErrors(registry, [/exposure\.beta is true on client but false on server/], emptySurfaces, {
      serverCapabilityKeys: ['MY_FEATURE_ENABLED'],
      serverRegistry: {
        backed: {
          serverCapabilityKey: 'MY_FEATURE_ENABLED',
          exposure: { ...ALL_OFF },
        },
      },
    });
  });

  it('fails when gated feature lacks exposure test coverage and acknowledgement', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'betaFeature', path: '/beta' }],
      navigationItems: [],
    };
    assertPolicyErrors(validRegistry, [/no exposure test coverage or acknowledgement/], surfaces);
  });

  it('passes when gated feature has a per-feature test file on disk', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'betaFeature', path: '/beta' }],
      navigationItems: [],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces, {
      existingTestFiles: ['src/features/betaFeature.test.tsx'],
    });
    assert.equal(result.ok, true);
  });

  it('passes when gated feature has a per-feature exposure contract test file on disk', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'betaFeature', path: '/beta' }],
      navigationItems: [],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces, {
      existingTestFiles: ['src/features/betaFeature.exposure.test.ts'],
    });
    assert.equal(result.ok, true);
  });

  it('fails when a registry-only v1.7 workstream lacks acknowledgement', () => {
    const { forecastWorkflowV2, ...withoutWorkflow } = v17WorkstreamRegistry;
    const registry = {
      ...withoutWorkflow,
      forecastWorkflowV2,
    };
    const acknowledgements = { ...v17Acknowledgements };
    delete acknowledgements.forecastWorkflowV2;

    assertPolicyErrors(registry, [/forecastWorkflowV2.*requires a valid acknowledgement/], emptySurfaces, {
      acknowledgements,
    });
  });

  it('fails when a v1.7 workstream is enabled on beta prematurely', () => {
    const registry = {
      ...v17WorkstreamRegistry,
      customProducts: {
        ...v17WorkstreamRegistry.customProducts,
        exposure: { ...ALL_OFF, beta: true },
      },
    };
    assertPolicyErrors(registry, [/customProducts.*betaEnablementApproved/], emptySurfaces, {
      acknowledgements: v17Acknowledgements,
    });
  });

  it('fails when all v1.7 workstream keys are removed from the registry', () => {
    const registry = {
      coreFeature: validRegistry.coreFeature,
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, {
      requireV17WorkstreamRegistry: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /missing all 6 required v1\.7 workstream keys/.test(error)));
  });

  it('passes when a v1.7 workstream enables beta with explicit approval', () => {
    const registry = {
      ...v17WorkstreamRegistry,
      autoTstm: {
        ...v17WorkstreamRegistry.autoTstm,
        exposure: { ...ALL_OFF, beta: true },
      },
    };
    const acknowledgements = {
      ...v17Acknowledgements,
      autoTstm: { ...v17Acknowledgements.autoTstm, betaEnablementApproved: true },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, {
      acknowledgements,
      serverCapabilityKeys: ['TSTM_GENERATION_ENABLED'],
      serverRegistry: {
        autoTstm: {
          serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
          exposure: { ...ALL_OFF, beta: true },
        },
      },
      sideEffectModules: { autoTstm: ['../utils/tstmGeneration'] },
      existingTestFiles: ['server/testing/autoTstm.exposure.test.js'],
    });
    assert.equal(result.ok, true);
  });

  it('passes when a v1.7 workstream enables local development with explicit approval', () => {
    const registry = {
      ...v17WorkstreamRegistry,
      forecastWorkflowV2: {
        ...v17WorkstreamRegistry.forecastWorkflowV2,
        exposure: { ...ALL_OFF, local: true },
      },
    };
    const acknowledgements = {
      ...v17Acknowledgements,
      forecastWorkflowV2: {
        ...v17Acknowledgements.forecastWorkflowV2,
        localDevelopmentApproved: true,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, {
      acknowledgements,
      serverCapabilityKeys: ['TSTM_GENERATION_ENABLED'],
      serverRegistry: {
        autoTstm: {
          serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
          exposure: { ...ALL_OFF },
        },
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails when a v1.7 workstream enables local development without explicit approval', () => {
    const registry = {
      ...v17WorkstreamRegistry,
      forecastWorkflowV2: {
        ...v17WorkstreamRegistry.forecastWorkflowV2,
        exposure: { ...ALL_OFF, local: true },
      },
    };
    assertPolicyErrors(registry, [/forecastWorkflowV2.*localDevelopmentApproved/], emptySurfaces, {
      acknowledgements: v17Acknowledgements,
    });
  });
});
