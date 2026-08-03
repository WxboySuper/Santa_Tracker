#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';
import {
  buildPromotionCheckRows,
  evaluateClientServerAlignment,
  evaluateExperimentalLeakage,
  findNewlyProductionVisible,
  formatExposureReport,
  generateProductionExposureReport,
  validatePromotionExposure,
} from './lib/feature-exposure-report.mjs';
import {
  formatPromotionExposureComment,
  upsertPromotionExposureComment,
} from './lib/pr-exposure-comment.mjs';
import { extractConst } from './lib/feature-exposure-source-parser.mjs';
import { loadPolicyInputs } from './validate-feature-exposure.mjs';

const baseRef = process.env.GITHUB_BASE_REF ?? '';
const headRef = process.env.GITHUB_HEAD_REF ?? '';
const eventName = process.env.GITHUB_EVENT_NAME ?? '';
const prNumber = Number(process.env.PR_NUMBER ?? 0);
const repository = process.env.GITHUB_REPOSITORY ?? '';
const token = process.env.GITHUB_TOKEN ?? '';
const runId = process.env.GITHUB_RUN_ID ?? '';

const isPromotionToMain =
  eventName === 'pull_request' && baseRef === 'main' && headRef === 'beta';

/** Loads the feature registry from a remote git ref. */
function loadRegistryFromRef(ref) {
  const source = execFileSync('git', ['show', `origin/${ref}:src/config/featureExposure.ts`], {
    encoding: 'utf8',
  });
  return extractConst(source, 'featureExposure.ts', 'FEATURE_EXPOSURE_REGISTRY');
}

/** Runs the full FND-06 policy against promotion head inputs. */
function evaluateHeadPolicy(inputs) {
  return evaluateFeatureExposurePolicy(
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
}

/** Builds the GitHub Actions run URL when repository and run id are available. */
function buildRunUrl() {
  if (!repository || !runId) return undefined;
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

/** Returns true when PR comment upsert credentials are available. */
function hasPrCommentCredentials() {
  return Boolean(prNumber && repository && token);
}

/** Posts or updates the single promotion exposure PR comment. */
async function maybeUpsertComment({ checkRows, report, newlyProductionVisible }) {
  if (!hasPrCommentCredentials()) {
    console.log('Skipping PR comment upsert (PR_NUMBER, GITHUB_REPOSITORY, or GITHUB_TOKEN unset).');
    return;
  }

  const body = formatPromotionExposureComment({
    checkRows,
    report,
    newlyProductionVisible,
    runUrl: buildRunUrl(),
  });

  try {
    const result = await upsertPromotionExposureComment({
      repository,
      token,
      prNumber,
      body,
    });
    console.log(`Promotion exposure comment ${result.action} (id=${result.commentId}).`);
  } catch (error) {
    console.warn(`Failed to upsert promotion exposure PR comment: ${error.message}`);
  }
}

/** Validates beta → main promotion exposure and updates the PR comment. */
export async function runPromotionExposureValidation() {
  const inputs = loadPolicyInputs();
  const baseRegistry = loadRegistryFromRef(baseRef);
  const policyResult = evaluateHeadPolicy(inputs);
  const leakageResult = evaluateExperimentalLeakage(inputs.registry, baseRegistry);
  const alignmentResult = evaluateClientServerAlignment(inputs.registry, inputs.serverRegistry);
  const promotionResult = validatePromotionExposure({
    headRegistry: inputs.registry,
    baseRegistry,
    policyResult,
  });
  const report = generateProductionExposureReport(inputs.registry);
  const newlyProductionVisible = findNewlyProductionVisible(baseRegistry, inputs.registry);
  const checkRows = buildPromotionCheckRows({
    policyResult,
    leakageResult,
    alignmentResult,
    promotionResult,
    registry: inputs.registry,
  });

  console.log(formatExposureReport({ report, newlyProductionVisible }));
  console.log('');

  for (const row of checkRows) {
    const icon = row.ok ? 'OK' : 'FAIL';
    console.log(`[${icon}] ${row.name.replace(/\*\*/g, '')}: ${row.details}`);
  }

  await maybeUpsertComment({ checkRows, report, newlyProductionVisible });

  if (!promotionResult.ok) {
    console.error('\nPromotion exposure check FAILED:');
    for (const error of promotionResult.errors) console.error(`  x ${error}`);
    return { ok: false, errors: promotionResult.errors };
  }

  console.log('\nPromotion exposure check OK.');
  return { ok: true, errors: [] };
}

async function main() {
  if (!isPromotionToMain) {
    process.exit(0);
  }

  try {
    const result = await runPromotionExposureValidation();
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Promotion exposure validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
