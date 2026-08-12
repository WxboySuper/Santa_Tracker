/**
 * Verification for Sentry's modern artifact-bundle sourcemap uploads.
 * The legacy release-files endpoint does not list these bundles.
 */

/** @typedef {{ ok: true, reason: string }} VerificationOk */
/** @typedef {{ ok: false, reason: string, status?: number }} VerificationFail */
/** @typedef {VerificationOk | VerificationFail} VerificationResult */

const projectSlug = (project) => project.trim().toLowerCase();
const isSuccessfulStatus = (status) => status >= 200 && status < 300;

/**
 * @param {unknown} body
 * @returns {Array<{ associations?: unknown; fileCount?: unknown }>}
 */
export const extractArtifactBundles = (body) => {
  if (Array.isArray(body)) return body;
  if (isArtifactBundlesEnvelope(body)) return body.artifactBundles;
  return [];
};

const isArtifactBundlesEnvelope = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.artifactBundles);

const hasReleaseAssociation = (bundles, release) =>
  bundles.some((bundle) =>
    Array.isArray(bundle?.associations) &&
    bundle.associations.some((association) => association?.release === release)
  );

const nextLink = (linkHeader) => {
  if (typeof linkHeader !== 'string' || !linkHeader) return null;
  const next = linkHeader.split(',').find((part) => /rel="?next"?/.test(part));
  const match = next?.match(/^\s*<([^>]+)>/);
  return match?.[1] ?? null;
};

const requestPage = async ({ fetchFn, url, token }) => {
  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, bundles: extractArtifactBundles(body), link: response.headers?.get?.('link') };
};

/**
 * Lists artifact bundles until the exact release is found or pagination ends.
 * @param {{ token: string; org: string; project: string; release: string; fetchFn?: typeof fetch }} context
 * @returns {Promise<{ status: number; body: unknown }>}
 */
export const fetchArtifactBundles = async ({ token, org, project, release, fetchFn = fetch }) => {
  let url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug(project))}/files/artifact-bundles/`;
  let status = 200;
  const bundles = [];

  while (url) {
    const page = await requestPage({ fetchFn, url, token });
    status = page.status;
    if (!isSuccessfulStatus(status) && page.bundles.length === 0) return { status, body: page.body };
    bundles.push(...page.bundles);
    url = isSuccessfulStatus(status) && !hasReleaseAssociation(page.bundles, release) ? nextLink(page.link) : null;
  }

  return { status, body: bundles };
};

const transportError = (status, release) => {
  if (status === 401 || status === 403) {
    return `Sentry rejected the auth token (HTTP ${status}). The release ${release} could not be verified.`;
  }
  if (status === 404) return `Sentry release ${release} was not found. Sourcemap upload failed before publication.`;
  if (!isSuccessfulStatus(status)) return `Sentry artifact-bundle request failed with HTTP ${status} for ${release}.`;
  return null;
};

/**
 * Confirms an artifact bundle is associated with the exact release.
 * @param {{ release: string; status: number; body: unknown; minimumFileCount?: number }} context
 * @returns {VerificationResult}
 */
export const verifyArtifactBundlesResponse = ({ release, status, body, minimumFileCount = 0 }) => {
  const error = transportError(status, release);
  if (error) return { ok: false, status, reason: error };

  const minimum = Math.max(1, minimumFileCount);
  const matching = extractArtifactBundles(body).filter((bundle) =>
    hasReleaseAssociation([bundle], release) && Number.isFinite(bundle?.fileCount) && bundle.fileCount >= minimum
  );
  if (matching.length === 0) {
    return { ok: false, status, reason: `Sentry release ${release} has no published artifact bundle with the expected files.` };
  }

  const fileCount = Math.max(...matching.map((bundle) => bundle.fileCount));
  return { ok: true, reason: `Sentry release ${release} verified with an artifact bundle containing ${fileCount} file(s).` };
};
