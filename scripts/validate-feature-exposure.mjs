#!/usr/bin/env node

/** Deterministic, non-executing feature exposure policy check for CI. */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';
import {
  collectGatedFeatures,
  PER_FEATURE_TEST_PATTERNS,
} from './lib/feature-exposure-policy-contract.mjs';
import {
  assertAcknowledgementsShape,
  extractConst,
  extractGatedRoutes,
  extractNavigationItems,
  extractServerCapabilityKeys,
  extractServerRegistry,
  extractSideEffectModules,
} from './lib/feature-exposure-source-parser.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** Reads a repository source file as UTF-8 text. */
function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/** Loads acknowledgement entries for gated features without dedicated tests. */
function loadAcknowledgements() {
  const acknowledgements = JSON.parse(readSource('src/config/featureExposure.acknowledgements.json'));
  assertAcknowledgementsShape(acknowledgements);
  return acknowledgements;
}

/** Returns repository-relative per-feature test files that exist on disk. */
function collectExistingTestFiles(gatedFeatureKeys) {
  const existingTestFiles = [];
  for (const featureKey of gatedFeatureKeys) {
    for (const pattern of PER_FEATURE_TEST_PATTERNS(featureKey)) {
      if (existsSync(resolve(ROOT, pattern))) {
        existingTestFiles.push(pattern);
      }
    }
  }
  return existingTestFiles;
}

/** Loads every policy input from repository sources. */
export function loadPolicyInputs() {
  const registry = extractConst(
    readSource('src/config/featureExposure.ts'),
    'featureExposure.ts',
    'FEATURE_EXPOSURE_REGISTRY'
  );
  const gatedRoutes = extractGatedRoutes(readSource('src/config/featureSurfaces.ts'));
  const navigationItems = extractNavigationItems(readSource('src/config/featureNavigation.ts'));
  const sideEffectModules = extractSideEffectModules(readSource('src/config/featureSurfaces.ts'));
  const serverRegistry = extractServerRegistry(readSource('server/lib/serverFeatureExposure.js'));
  const serverCapabilityKeys = extractServerCapabilityKeys(serverRegistry);
  const acknowledgements = loadAcknowledgements();
  const existingTestFiles = collectExistingTestFiles(
    collectGatedFeatures({ gatedRoutes, navigationItems }, sideEffectModules)
  );

  return {
    registry,
    gatedRoutes,
    navigationItems,
    sideEffectModules,
    serverRegistry,
    serverCapabilityKeys,
    acknowledgements,
    existingTestFiles,
  };
}

/** Executes the policy check and prints CI diagnostics. */
function main() {
  let inputs = null;
  try {
    inputs = loadPolicyInputs();
  } catch (error) {
    console.error(`Failed to extract feature exposure policy inputs: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const {
    registry,
    gatedRoutes,
    navigationItems,
    sideEffectModules,
    serverRegistry,
    serverCapabilityKeys,
    acknowledgements,
    existingTestFiles,
  } = inputs;
  const result = evaluateFeatureExposurePolicy(
    registry,
    { gatedRoutes, navigationItems },
    {
      serverCapabilityKeys,
      serverRegistry,
      sideEffectModules,
      acknowledgements,
      existingTestFiles,
      requireV17WorkstreamRegistry: true,
    }
  );

  if (!result.ok) {
    console.error('Feature exposure policy FAILED:');
    for (const error of result.errors) console.error(`  x ${error}`);
    console.error(`\n${result.errors.length} violation(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log('Feature exposure policy OK: all checks passed.');
  console.log(`  Registry: ${Object.keys(registry).length} features`);
  console.log(`  Gated routes: ${gatedRoutes.length}`);
  console.log(`  Navigation items: ${navigationItems.length}`);
  console.log(`  Side-effect modules: ${Object.keys(sideEffectModules).length}`);
  console.log(`  Server registry entries: ${Object.keys(serverRegistry).length}`);
  console.log(`  Exposure acknowledgements: ${Object.keys(acknowledgements).length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
