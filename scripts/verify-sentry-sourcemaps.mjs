import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildReleaseName,
  evaluateSentryConfig,
  extractArtifactBundles,
  extractFiles,
  fetchArtifactBundles,
  fetchReleaseFiles,
  findMissingLocalMaps,
  verifyArtifactBundlesResponse,
  verifyReleaseFilesResponse,
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
    const localMaps = collectSourcemaps(BUILD_DIR);
    const localMapBasenames = localMaps.map((path) => path.split(/[\\/]/).pop());

    const { status, body } = await fetchReleaseFiles({ token, org, project, release });
    const releaseResult = verifyReleaseFilesResponse({ release, status, body });
    const releaseFiles = extractFiles(body);
    const shouldCheckArtifactBundles =
      status === 400 ||
      (status >= 200 && status < 300 && Array.isArray(releaseFiles) && releaseFiles.length === 0);

    if (!releaseResult.ok && shouldCheckArtifactBundles) {
      const artifactBundles = await fetchArtifactBundles({ token, org, project, release });
      const artifactResult = verifyArtifactBundlesResponse({
        release,
        ...artifactBundles,
        minimumFileCount: localMaps.length,
      });
      if (artifactResult.ok) {
        console.log(artifactResult.reason);
        const deleted = deleteLocalSourcemaps(BUILD_DIR);
        console.log(`Deleted ${deleted} local sourcemap file(s) after verified publication.`);
        return;
      }
      console.error(`::error::${artifactResult.reason}`);
      console.error('Local sourcemaps were preserved as recovery artifacts.');
      process.exit(1);
    }

    if (!releaseResult.ok) {
      console.error(`::error::${releaseResult.reason}`);
      console.error('Local sourcemaps were preserved as recovery artifacts.');
      process.exit(1);
    }

    const remoteFiles = Array.isArray(body) ? body : body?.files ?? [];
    const { missing } = findMissingLocalMaps({ remoteFiles, localMapBasenames });
    if (missing.length > 0) {
      console.error(
        `::error::Local sourcemaps missing from Sentry release ${release}: ${missing.join(', ')}. ` +
          'Not all maps were published; preserving local artifacts.'
      );
      process.exit(1);
    }

    console.log(releaseResult.reason);
    const deleted = deleteLocalSourcemaps(BUILD_DIR);
    console.log(`Deleted ${deleted} local sourcemap file(s) after verified publication.`);
  } catch (error) {
    console.error(`::error::Sentry sourcemap verification failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Local sourcemaps were preserved as recovery artifacts.');
    process.exit(1);
  }
};

main();
