/**
 * Sentry sourcemap publication verification.
 *
 * The Vite Sentry plugin can report a successful build even when sourcemap
 * upload silently fails, and the previous configuration deleted local maps
 * after the upload attempt regardless of outcome. That produced a release with
 * unsymbolicated errors and no retained recovery artifact.
 *
 * This module verifies, against the Sentry API, that a release exists for the
 * exact application release and that sourcemap artifacts were actually
 * published. Only after confirmed success are local maps safe to delete.
 */

const SENTRY_RELEASE_PREFIX = 'graphical-forecast-creator@';

/** Sentry project slugs are lowercase even when the configured value is not. */
export const normalizeProjectSlug = (project) => project.trim().toLowerCase();

/** @typedef {{ ok: true, reason: string }} VerificationOk */
/** @typedef {{ ok: false, reason: string, status?: number }} VerificationFail */
/** @typedef {VerificationOk | VerificationFail} VerificationResult */

/**
 * Evaluates whether Sentry publication is configured for this build.
 * @param {Record<string, string | undefined>} env
 * @returns {{ configured: boolean, missing: string[] }}
 */
export const evaluateSentryConfig = (env) => {
  const required = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
  const missing = required.filter((key) => !env[key]);
  return { configured: missing.length === 0, missing };
};

/**
 * Builds the exact release name the application uses for sourcemaps.
 * @param {{ version: string }} pkg
 * @returns {string}
 */
export const buildReleaseName = (pkg) => `${SENTRY_RELEASE_PREFIX}${pkg.version}`;

/**
 * Validates the release-file list returned by the Sentry API and confirms the
 * exact application release was published with sourcemaps.
 * @param {{
 *   release: string;
 *   status: number;
 *   body: unknown;
 * }} context
 * @returns {VerificationResult}
 */
export const verifyReleaseFilesResponse = ({ release, status, body }) => {
  const transportError = transportErrorForStatus(status, release);
  if (transportError) return transportError;

  const files = extractFiles(body);
  if (!files || files.length === 0) {
    return emptyArtifactsResult(status, release);
  }

  return coverageResult(files, status, release);
};

/** Maps non-2xx transport statuses to a verification failure, or null when the request succeeded. */
const transportErrorForStatus = (status, release) => {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      status,
      reason: `Sentry rejected the auth token (HTTP ${status}). The release ${release} could not be verified.`,
    };
  }

  if (status === 404) {
    return {
      ok: false,
      status,
      reason: `Sentry release ${release} was not found. Sourcemap upload failed before publication.`,
    };
  }

  if (status < 200 || status >= 300) {
    return {
      ok: false,
      status,
      reason: `Sentry release-files request failed with HTTP ${status} for ${release}.`,
    };
  }

  return null;
};

/** Returns a failure when a release exists but has no uploaded artifacts. */
const emptyArtifactsResult = (status, release) => ({
  ok: false,
  status,
  reason: `Sentry release ${release} exists but has no uploaded artifacts.`,
});

/** Verifies a 2xx response published both bundles and sourcemaps for the same files. */
const coverageResult = (files, status, release) => {
  const names = files
    .map((file) => (typeof file.name === 'string' ? file.name : null))
    .filter((name) => name !== null);

  const mapFiles = names.filter((name) => name.endsWith('.map'));
  const jsFiles = names.filter((name) => name.endsWith('.js'));

  if (mapFiles.length === 0 || jsFiles.length === 0) {
    return {
      ok: false,
      status,
      reason:
        `Sentry release ${release} is missing sourcemap coverage ` +
        `(maps=${mapFiles.length}, bundles=${jsFiles.length}).`,
    };
  }

  // Require at least one bundle to have a matching .map artifact so a stale
  // release that only contains older, unrelated files cannot satisfy the gate.
  const mapBases = new Set(mapFiles.map((name) => name.replace(/\.map$/, '')));
  const hasMatchingPair = jsFiles.some((name) => mapBases.has(name));
  if (!hasMatchingPair) {
    return {
      ok: false,
      status,
      reason:
        `Sentry release ${release} has no bundle with a matching sourcemap artifact ` +
        `(maps=${mapFiles.length}, bundles=${jsFiles.length}).`,
    };
  }

  return {
    ok: true,
    reason: `Sentry release ${release} verified with ${mapFiles.length} sourcemap artifact(s).`,
  };
};

/**
 * Extracts the files array from a Sentry release-files response, tolerating
 * both the `{ files: [...] }` envelope and a raw array.
 * @param {unknown} body
 * @returns {Array<{ name?: unknown }> | null}
 */
export const extractFiles = (body) => {
  if (Array.isArray(body)) {
    return /** @type {Array<{ name?: unknown }>} */ (body);
  }
  return isFilesEnvelope(body) ? /** @type {Array<{ name?: unknown }>} */ (body.files) : null;
};

/** Returns true when a value is a `{ files: [...] }` envelope. */
const isFilesEnvelope = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray(value.files);

/** Parses a Link header's next-page URL when present. */
const nextLinkFromHeader = (linkHeader) => {
  if (typeof linkHeader !== 'string' || !linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const [url, ...rels] = part.split(';').map((chunk) => chunk.trim());
    if (rels.some((rel) => /rel="?next"?/.test(rel))) {
      const match = url.match(/^<([^>]+)>$/);
      return match ? match[1] : null;
    }
  }
  return null;
};

/**
 * Lists published artifacts for a release from the Sentry API, following
 * pagination Link headers so a multi-page artifact set is fully verified.
 * @param {{
 *   token: string;
 *   org: string;
 *   project: string;
 *   release: string;
 *   fetchFn?: typeof fetch;
 * }} context
 * @returns {Promise<{ status: number; body: unknown }>}
 */
export const fetchReleaseFiles = async ({ token, org, project, release, fetchFn = fetch }) => {
  const projectSlug = normalizeProjectSlug(project);
  let url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/releases/${encodeURIComponent(release)}/files/`;
  let allFiles = [];
  let status = 200;

  while (url) {
    const response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    status = response.status;
    const body = await response.json().catch(() => null);

    const pageFiles = extractFiles(body);
    if (!pageFiles) {
      return { status, body };
    }
    allFiles = allFiles.concat(pageFiles);
    url = status < 200 || status >= 300 ? null : nextLinkFromHeader(response.headers?.get?.('link'));
  }

  return { status, body: { files: allFiles } };
};

/**
 * Verifies a release publication and, on success, returns the verified result.
 * @param {{
 *   token: string;
 *   org: string;
 *   project: string;
 *   release: string;
 *   fetchFn?: typeof fetch;
 * }} context
 * @returns {Promise<VerificationResult>}
 */
export const verifySentryRelease = async ({ token, org, project, release, fetchFn }) => {
  const response = await fetchReleaseFiles({ token, org, project, release, fetchFn });
  return verifyReleaseFilesResponse({ release, ...response });
};

/**
 * Checks that every local sourcemap basename exists among the remotely
 * published artifacts, so a build whose maps were partially uploaded cannot
 * be deleted as "verified".
 * @param {{
 *   remoteFiles: Array<{ name?: unknown }>;
 *   localMapBasenames: string[];
 * }} context
 * @returns {{ missing: string[] }}
 */
export const findMissingLocalMaps = ({ remoteFiles, localMapBasenames }) => {
  const remoteBasenames = new Set(
    remoteFiles
      .map((file) => (typeof file.name === 'string' ? file.name.split('/').pop() : null))
      .filter((name) => name !== null)
  );
  const missing = localMapBasenames.filter((basename) => !remoteBasenames.has(basename));
  return { missing };
};
