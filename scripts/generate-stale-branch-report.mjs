#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildStaleBranchReport,
  formatStaleBranchReport,
} from './lib/stale-branch-report.mjs';
import {
  fetchStaleBranchInputs,
  loadFixtureInputs,
  upsertStaleBranchReportIssue,
} from './lib/stale-branch-github.mjs';

/**
 * @param {string} repository
 * @param {string} runId
 */
function buildRunUrl(repository, runId) {
  if (!repository || !runId) {
    return undefined;
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

/**
 * @param {string} body
 */
function writeStepSummary(body) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  appendFileSync(summaryPath, `${body}\n`, 'utf8');
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   repository?: string,
 *   token?: string,
 *   runId?: string,
 *   publishIssue?: boolean,
 * }} [options]
 */
function resolveReportConfig(options = {}) {
  return {
    dryRun: options.dryRun ?? process.env.DRY_RUN === '1',
    repository: options.repository ?? process.env.GITHUB_REPOSITORY ?? '',
    token: options.token ?? process.env.GITHUB_TOKEN ?? '',
    runId: options.runId ?? process.env.GITHUB_RUN_ID ?? '',
    publishIssue: options.publishIssue ?? true,
  };
}

/**
 * @param {{
 *   dryRun: boolean,
 *   repository: string,
 *   token: string,
 * }} config
 */
async function loadReportInputs(config) {
  if (config.dryRun) {
    return loadFixtureInputs();
  }
  if (!config.repository || !config.token) {
    throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required unless DRY_RUN=1.');
  }
  return fetchStaleBranchInputs({ repository: config.repository, token: config.token });
}

/**
 * @param {Awaited<ReturnType<typeof loadReportInputs>>} inputs
 * @param {{
 *   repository: string,
 *   runId: string,
 * }} config
 */
function buildReportBody(inputs, config) {
  const report = buildStaleBranchReport(inputs);
  const body = formatStaleBranchReport({
    ...report,
    errors: inputs.errors ?? [],
    runUrl: buildRunUrl(config.repository, config.runId),
    repository: config.repository || undefined,
  });
  return { report, body };
}

/**
 * @param {{
 *   dryRun: boolean,
 *   publishIssue: boolean,
 *   repository: string,
 *   token: string,
 * }} config
 * @param {string} body
 */
async function maybePublishIssue(config, body) {
  if (config.dryRun || !config.publishIssue) {
    return;
  }
  if (!config.repository || !config.token) {
    console.log('Skipping issue upsert (GITHUB_REPOSITORY or GITHUB_TOKEN unset).');
    return;
  }

  try {
    const result = await upsertStaleBranchReportIssue({
      repository: config.repository,
      token: config.token,
      body,
    });
    console.log(`Stale branch report issue ${result.action} (#${result.issueNumber}).`);
  } catch (error) {
    const message = `Failed to upsert stale branch report issue: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(message);
    writeStepSummary(`\n### Publish errors\n\n- ${message}\n`);
  }
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   repository?: string,
 *   token?: string,
 *   runId?: string,
 *   publishIssue?: boolean,
 * }} [options]
 */
export async function runStaleBranchReport(options = {}) {
  const config = resolveReportConfig(options);
  const inputs = await loadReportInputs(config);
  const { report, body } = buildReportBody(inputs, config);

  console.log(body);
  writeStepSummary(body);
  await maybePublishIssue(config, body);

  return { report, body, dryRun: config.dryRun };
}

async function main() {
  try {
    await runStaleBranchReport();
  } catch (error) {
    const message = `Stale branch report failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    writeStepSummary(`### Stale branch report failed\n\n${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
