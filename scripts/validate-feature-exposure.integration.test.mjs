import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadPolicyInputs } from './validate-feature-exposure.mjs';
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('validate-feature-exposure integration', () => {
  it('loads current repository policy inputs without extraction errors', () => {
    const inputs = loadPolicyInputs();
    assert.ok(Object.keys(inputs.registry).length > 0);
    assert.ok(Array.isArray(inputs.gatedRoutes));
    assert.ok(Array.isArray(inputs.navigationItems));
    assert.ok(typeof inputs.sideEffectModules === 'object');
    assert.ok(typeof inputs.serverRegistry === 'object');
    assert.ok(Array.isArray(inputs.serverCapabilityKeys));
    assert.ok(typeof inputs.acknowledgements === 'object');
  });

  it('passes policy evaluation against current repository sources', () => {
    const inputs = loadPolicyInputs();
    const result = evaluateFeatureExposurePolicy(
      inputs.registry,
      { gatedRoutes: inputs.gatedRoutes, navigationItems: inputs.navigationItems },
      {
        serverCapabilityKeys: inputs.serverCapabilityKeys,
        serverRegistry: inputs.serverRegistry,
        sideEffectModules: inputs.sideEffectModules,
        acknowledgements: inputs.acknowledgements,
        existingTestFiles: inputs.existingTestFiles,
        requireV17WorkstreamRegistry: true,
      }
    );
    assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));
  });

  it('exits successfully when run as the CI entry point', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-feature-exposure.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join('\n')
    );
  });
});
