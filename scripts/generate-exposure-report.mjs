#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';
import {
  formatExposureReport,
  generateProductionExposureReport,
} from './lib/feature-exposure-report.mjs';
import { loadPolicyInputs } from './validate-feature-exposure.mjs';

/** @param {ReturnType<typeof loadPolicyInputs>} inputs */
function runPolicy(inputs) {
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

  return evaluateFeatureExposurePolicy(
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
}

/** Prints the exposure report for local and CI diagnostics. */
export function runExposureReport({ json = false } = {}) {
  const inputs = loadPolicyInputs();
  const policyResult = runPolicy(inputs);
  const report = generateProductionExposureReport(inputs.registry);
  const formatted = formatExposureReport({ report, newlyProductionVisible: [] });

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: policyResult.ok,
          policyErrors: policyResult.ok ? [] : policyResult.errors,
          report,
          newlyProductionVisible: [],
        },
        null,
        2
      )
    );
  } else {
    console.log(formatted);
    if (!policyResult.ok) {
      console.error('\nFeature exposure policy FAILED:');
      for (const error of policyResult.errors) console.error(`  x ${error}`);
    }
  }

  return { ok: policyResult.ok, report, policyResult };
}

function main() {
  const json = process.argv.includes('--json');

  try {
    const result = runExposureReport({ json });
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Failed to generate exposure report: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
