import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  normalizeDeploymentConfig,
  renderServerEnvFile,
} from './deployment-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const WRITE_DEPLOYMENT_ENV_SCRIPT = resolve(ROOT, 'scripts/write-deployment-env.mjs');

describe('deployment config', () => {
  it('normalizes server env values', () => {
    assert.deepEqual(
      normalizeDeploymentConfig({
        serverEnv: {
          TSTM_GENERATION_ENABLED: 'true',
          TSTM_INGESTION_ENABLED: 'false',
        },
      }),
      {
        serverEnv: {
          TSTM_GENERATION_ENABLED: 'true',
          TSTM_INGESTION_ENABLED: 'false',
        },
      }
    );
  });

  it('renders deterministic workflow env file lines', () => {
    assert.equal(
      renderServerEnvFile({
        serverEnv: {
          TSTM_INGESTION_ENABLED: 'true',
          TSTM_GENERATION_ENABLED: 'true',
        },
      }),
      ['TSTM_GENERATION_ENABLED=true', 'TSTM_INGESTION_ENABLED=true'].join('\n')
    );
  });

  it('rejects missing serverEnv config', () => {
    assert.throws(() => normalizeDeploymentConfig({}), /serverEnv object/);
  });

  it('rejects invalid env keys and non-string values', () => {
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { 'bad-key': 'true' } }),
      /Invalid serverEnv key/
    );
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: true } }),
      /must be a string/
    );
  });

  it('rejects values with line breaks', () => {
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: 'true\nBAD=1' } }),
      /line breaks/
    );
    assert.throws(
      () => normalizeDeploymentConfig({ serverEnv: { TSTM_GENERATION_ENABLED: 'true\n' } }),
      /line breaks/
    );
  });

  it('renders checked-in deployment config through the CLI', () => {
    const output = execFileSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/production-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(output, '');
    assert.match(output, /\n$/);
    const lines = output.trimEnd().split('\n');
    assert.deepEqual(
      lines.map((line) => line.split('=', 1)[0]),
      ['PYTHON_BIN', 'TSTM_GENERATION_ENABLED', 'TSTM_INGESTION_ENABLED']
    );
    assert.ok(lines.every((line) => /^[A-Z][A-Z0-9_]*=.+$/.test(line)));
  });

  it('renders the beta Auto-TSTM worker interpreter override', () => {
    const output = execFileSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/beta-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.match(output, /^PYTHON_BIN=\/opt\/gfc-beta-analytics\/\.venv\/bin\/python$/m);
    assert.match(output, /^TSTM_GENERATION_ENABLED=true$/m);
    assert.match(output, /^TSTM_INGESTION_ENABLED=true$/m);
  });

  it('rejects config paths outside deploy', () => {
    const outsideConfig = resolve(tmpdir(), `gfc-deploy-config-${Date.now()}.json`);
    writeFileSync(outsideConfig, '{"serverEnv":{"TSTM_GENERATION_ENABLED":"true"}}');

    const result = spawnSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      outsideConfig,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /under deploy/);
  });

  it('prints readable errors for missing config files', () => {
    const result = spawnSync(process.execPath, [
      WRITE_DEPLOYMENT_ENV_SCRIPT,
      'deploy/missing-deployment-config.json',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Failed to read deployment config/);
    assert.doesNotMatch(result.stderr, /at async|at ModuleJob|at file:/);
  });
});
