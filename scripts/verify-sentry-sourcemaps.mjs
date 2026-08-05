import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildReleaseName,
  evaluateSentryConfig,
  verifySentryRelease,
} from './lib/sentry-sourcemap-verification.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_DIR = resolve(ROOT, process.argv[2] || 'build');

/**
 * Recursively collects sourcemap files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
export const collectSourcemaps = (dir) => {
  if (!existsSync(dir)) {
    return [];
  }
  const results = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const fullPath = resolve(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (fullPath.endsWith('.map')) {
        results.push(fullPath);
      }
    }
  };
  walk(dir);
  return results;
};

/**
 * Deletes local sourcemaps only after publication has been verified.
 * @param {string} dir
 * @returns {number}
 */
export const deleteLocalSourcemaps = (dir) => {
  const maps = collectSourcemaps(dir);
  for (const map of maps) {
    rmSync(map, { force: true });
  }
  return maps.length;
};

/**
 * Verifies Sentry sourcemap publication for the current build and deletes
 * local maps only on confirmed success. Exits non-zero when configured but
 * unverifiable so deployments fail closed.
 */
const main = async () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const release = buildReleaseName(pkg);
  const { configured, missing } = evaluateSentryConfig(process.env);

  if (!configured) {
    console.log(
      `Sentry publication not configured (missing ${missing.join(', ')}); skipping verification. ` +
        'Local builds remain supported and no maps are deleted.'
    );
    process.exit(0);
  }

  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  try {
    const result = await verifySentryRelease({ token, org, project, release });
    if (!result.ok) {
      console.error(`::error::${result.reason}`);
      console.error('Local sourcemaps were preserved as recovery artifacts.');
      process.exit(1);
    }
    console.log(result.reason);
    const deleted = deleteLocalSourcemaps(BUILD_DIR);
    console.log(`Deleted ${deleted} local sourcemap file(s) after verified publication.`);
  } catch (error) {
    console.error(`::error::Sentry sourcemap verification failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Local sourcemaps were preserved as recovery artifacts.');
    process.exit(1);
  }
};

main();
