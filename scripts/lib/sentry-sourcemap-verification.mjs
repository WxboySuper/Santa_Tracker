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

/**
 * Validates the artifact-bundle index returned by Sentry's modern sourcemap
 * uploader. Artifact bundles are not exposed through the legacy release-files
 * endpoint, so the release can be healthy while that endpoint is empty.
 * @param {{ release: string; status: number; body: unknown; minimumFileCount?: number }} context
 * @returns {VerificationResult}
 */
export const verifyArtifactBundlesResponse = ({ release, status, body, minimumFileCount = 0 }) => {
  const transportError = transportErrorForStatus(status, release);
  if (transportError) return transportError;

  const bundles = extractArtifactBundles(body);
  const matchingBundles = bundles.filter(
    (bundle) =>
      Array.isArray(bundle?.associations) &&
      bundle.associations.some((association) => association?.release === release) &&
      Number.isFinite(bundle?.fileCount) &&
      bundle.fileCount >= Math.max(1, minimumFileCount)
  );

  if (matchingBundles.length === 0) {
    return {
      ok: false,
      status,
      reason: `Sentry release ${release} has no published artifact bundle with the expected files.`,
    };
  }

  const fileCount = Math.max(...matchingBundles.map((bundle) => bundle.fileCount));
  return {
    ok: true,
    reason: `Sentry release ${release} verified with an artifact bundle containing ${fileCount} file(s).`,
  };
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

/**
 * Extracts artifact bundles from the Sentry artifact-bundle index response.
 * @param {unknown} body
 * @returns {Array<{ associations?: unknown; fileCount?: unknown }>}
 */
export const extractArtifactBundles = (body) => {
  if (Array.isArray(body)) {
    return /** @type {Array<{ associations?: unknown; fileCount?: unknown }>} */ (body);
  }
  if (isArtifactBundlesEnvelope(body)) {
    return /** @type {Array<{ associations?: unknown; fileCount?: unknown }>} */ (body.artifactBundles);
  }
  return [];
};

/** Returns true when a value is a `{ files: [...] }` envelope. */
const isFilesEnvelope = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray(value.files);

/** Returns true when a value is an `{ artifactBundles: [...] }` envelope. */
const isArtifactBundlesEnvelope = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray(value.artifactBundles);

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
 * Lists modern artifact bundles for a project, following pagination links.
 * @param {{ token: string; org: string; project: string; release?: string; fetchFn?: typeof fetch }} context
 * @returns {Promise<{ status: number; body: unknown }>}
 */
export const fetchArtifactBundles = async ({ token, org, project, release, fetchFn = fetch }) => {
  const projectSlug = normalizeProjectSlug(project);
  let url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/files/artifact-bundles/`;
  let allBundles = [];
  let status = 200;

  while (url) {
    const page = await fetchArtifactBundlePage({ fetchFn, url, token });
    ({ status } = page);

    if (isArtifactBundleErrorPage(page)) {
      return { status, body: page.body };
    }
    allBundles = allBundles.concat(page.bundles);
    url = nextArtifactBundleUrl({ page, release });
  }

  return { status, body: allBundles };
};

const fetchArtifactBundlePage = async ({ fetchFn, url, token }) => {
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, bundles: extractArtifactBundles(body), link: response.headers?.get?.('link') };
};

const isArtifactBundleErrorPage = ({ status, body, bundles }) =>
  status >= 300 && !Array.isArray(body) && bundles.length === 0;

const hasReleaseAssociation = (bundles, release) =>
  Boolean(
    release &&
      bundles.some((bundle) =>
        Array.isArray(bundle?.associations) &&
        bundle.associations.some((association) => association?.release === release)
      )
  );

const nextArtifactBundleUrl = ({ page, release }) => {
  if (page.status < 200 || page.status >= 300 || hasReleaseAssociation(page.bundles, release)) {
    return null;
  }
  return nextLinkFromHeader(page.link);
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
  const releaseFiles = await fetchReleaseFiles({ token, org, project, release, fetchFn });
  const releaseResult = verifyReleaseFilesResponse({ release, ...releaseFiles });
  const files = extractFiles(releaseFiles.body);
  const shouldCheckArtifactBundles =
    releaseFiles.status === 400 ||
    (releaseFiles.status >= 200 && releaseFiles.status < 300 && Array.isArray(files) && files.length === 0);
  if (!shouldCheckArtifactBundles || releaseResult.ok) {
    return releaseResult;
  }

  const artifactBundles = await fetchArtifactBundles({ token, org, project, release, fetchFn });
  return verifyArtifactBundlesResponse({ release, ...artifactBundles });
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
