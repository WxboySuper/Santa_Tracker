/**
 * Dependency-license policy for GFC.
 *
 * Defines the allowed / review-required / prohibited license categories used by
 * the third-party notice generator and the CI license check. Any dependency
 * whose license is unknown or policy-incompatible fails the check with an
 * actionable report.
 */

/** Licenses that are always allowed without review. */
export const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Zlib',
  'Python-2.0',
]);

/** Licenses that require an explicit, documented review before shipping. */
export const REVIEW_REQUIRED_LICENSES = new Set([
  'MPL-2.0',
  'EPL-2.0',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'GPL-2.0-only',
  'GPL-3.0-only',
  'AGPL-3.0-only',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
]);

/** Licenses that are prohibited without an exception granted by the maintainer. */
export const PROHIBITED_LICENSES = new Set([
  'BUSL-1.1',
  'SSPL-1.0',
  'CC-BY-NC-4.0',
]);

/** License identifiers that are treated as "public domain" equivalents. */
export const PUBLIC_DOMAIN_MARKERS = ['public domain', 'unlicense', 'cc0', 'cc0-1.0', '0bsd'];

/** Categorizes a license identifier string into a policy outcome. */
export const classifyLicense = (license = '') => {
  const normalized = license.trim().toLowerCase();

  if (!normalized) {
    return { category: 'unknown', ok: false };
  }

  if (PUBLIC_DOMAIN_MARKERS.some((marker) => normalized === marker || normalized.includes(marker))) {
    return { category: 'allowed', ok: true };
  }

  for (const identifier of ALLOWED_LICENSES) {
    if (normalized === identifier.toLowerCase() || normalized === `(${identifier.toLowerCase()})`) {
      return { category: 'allowed', ok: true };
    }
  }

  for (const identifier of REVIEW_REQUIRED_LICENSES) {
    if (normalized === identifier.toLowerCase() || normalized === `(${identifier.toLowerCase()})`) {
      return { category: 'review-required', ok: true };
    }
  }

  for (const identifier of PROHIBITED_LICENSES) {
    if (normalized === identifier.toLowerCase() || normalized === `(${identifier.toLowerCase()})`) {
      return { category: 'prohibited', ok: false };
    }
  }

  return { category: 'unknown', ok: false };
};
