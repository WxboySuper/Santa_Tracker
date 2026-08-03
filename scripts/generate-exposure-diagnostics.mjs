#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import {
  assertBuildTarget,
  generateFeatureExposureDiagnostics,
  loadEnvFile,
  serializeFeatureExposureDiagnostics,
} from './lib/feature-exposure-diagnostics.mjs';
import { loadPolicyInputs } from './validate-feature-exposure.mjs';

const BUILD_TARGETS = ['local', 'beta', 'staging', 'production'];

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = {
    target: 'local',
    json: false,
    public: false,
    envFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--public') {
      options.public = true;
      continue;
    }

    if (arg === '--target') {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--env-file') {
      options.envFile = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

/** Prints maintainer-facing feature exposure diagnostics for CI and local drills. */
export function runExposureDiagnostics(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  assertBuildTarget(options.target);

  const inputs = loadPolicyInputs();
  const envOverrides = options.envFile ? loadEnvFile(options.envFile) : {};
  const report = generateFeatureExposureDiagnostics(inputs, {
    target: options.target,
    env: envOverrides,
    includeInternalMetadata: !options.public,
  });

  if (options.json) {
    console.log(serializeFeatureExposureDiagnostics(report));
  } else {
    console.log(`Feature exposure diagnostics (${report.buildTarget})`);
    console.log(`Generated: ${report.generatedAt}`);
    console.log('');

    for (const diagnostic of report.features) {
      const exposure = diagnostic.resolvedExposed ? 'enabled' : 'disabled';
      console.log(
        `${diagnostic.featureKey}: ${exposure} (${diagnostic.reason})${
          diagnostic.serverCapability
            ? ` [server ${diagnostic.serverCapability.serverReason}, agrees=${diagnostic.serverCapability.agreesWithClient}]`
            : ''
        }`
      );
    }
  }

  return report;
}

function main() {
  try {
    runExposureDiagnostics();
  } catch (error) {
    console.error(`Failed to generate exposure diagnostics: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { BUILD_TARGETS };
