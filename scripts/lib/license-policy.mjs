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

/** Normalizes a license identifier to a lowercase, de-parenthesized key. */
const normalizeLicense = (license) => license.trim().toLowerCase().replace(/^\(|\)$/g, '');

/** Returns true when the normalized license matches a known set of identifiers. */
const matchesSet = (normalized, identifiers) =>
  [...identifiers].some((id) => normalized === id.toLowerCase());

/** Returns true when the normalized license matches a public-domain marker. */
const matchesPublicDomain = (normalized) =>
  PUBLIC_DOMAIN_MARKERS.some((marker) => normalized === marker.toLowerCase() || normalized.includes(marker));

/** Splits an SPDX `A OR B` dual-license expression into its alternatives. */
const splitDualLicense = (normalized) =>
  normalized
    .split(/\s+or\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

/** Categorizes a single normalized license identifier into a policy outcome. */
const classifySingleLicense = (normalized) => {
  if (!normalized) {
    return { category: 'unknown', ok: false };
  }

  if (matchesPublicDomain(normalized) || matchesSet(normalized, ALLOWED_LICENSES)) {
    return { category: 'allowed', ok: true };
  }

  if (matchesSet(normalized, REVIEW_REQUIRED_LICENSES)) {
    return { category: 'review-required', ok: true };
  }

  if (matchesSet(normalized, PROHIBITED_LICENSES)) {
    return { category: 'prohibited', ok: false };
  }

  return { category: 'unknown', ok: false };
};

/** Categorizes a license identifier string into a policy outcome. */
// @codescene(disable:"Complex Conditional", disable:"Bumpy Road Ahead")
export const classifyLicense = (license = '') => {
  const normalized = normalizeLicense(license);

  // SPDX dual-license expressions (e.g. `(MIT OR GPL-3.0-or-later)`) let the
  // consumer choose any listed license; accept when at least one alternative
  // is allowed, and flag review when the best alternative is copyleft.
  const alternatives = splitDualLicense(normalized);
  if (alternatives.length > 1) {
    const outcomes = alternatives.map(classifySingleLicense);
    if (outcomes.some((outcome) => outcome.category === 'allowed')) {
      return { category: 'allowed', ok: true };
    }
    if (outcomes.some((outcome) => outcome.category === 'review-required')) {
      return { category: 'review-required', ok: true };
    }
    if (outcomes.some((outcome) => outcome.category === 'prohibited')) {
      return { category: 'prohibited', ok: false };
    }
    return { category: 'unknown', ok: false };
  }

  return classifySingleLicense(normalized);
};
