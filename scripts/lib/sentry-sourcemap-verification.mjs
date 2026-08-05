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

/** Verifies a 2xx response published both bundles and sourcemaps. */
const coverageResult = (files, status, release) => {
  const mapFiles = files.filter((file) => typeof file.name === 'string' && file.name.endsWith('.map'));
  const jsFiles = files.filter((file) => typeof file.name === 'string' && file.name.endsWith('.js'));

  if (mapFiles.length === 0 || jsFiles.length === 0) {
    return {
      ok: false,
      status,
      reason:
        `Sentry release ${release} is missing sourcemap coverage ` +
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
  if (body && typeof body === 'object' && Array.isArray(body.files)) {
    return /** @type {Array<{ name?: unknown }>} */ (body.files);
  }
  return null;
};

/**
 * Lists published artifacts for a release from the Sentry API.
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
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/releases/${encodeURIComponent(release)}/files/`;
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
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
  const { status, body } = await fetchReleaseFiles({ token, org, project, release, fetchFn });
  return verifyReleaseFilesResponse({ release, status, body });
};
