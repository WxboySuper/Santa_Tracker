import {
  validateClientServerExposureMatrices,
  validateClientServerRegistryAlignment,
} from './feature-exposure-policy-alignment.mjs';

/** @typedef {'production' | 'beta-only' | 'local-only' | 'disabled'} ExposureCategory */

/**
 * @param {Record<string, any>} definition
 * @returns {ExposureCategory}
 */
export function classifyFeatureExposure(definition) {
  const { exposure } = definition;
  if (exposure.production === true) return 'production';
  if (exposure.beta === true) return 'beta-only';
  if (exposure.local === true) return 'local-only';
  return 'disabled';
}

/**
 * @param {string} featureKey
 * @param {Record<string, any>} definition
 */
function toFeatureEntry(featureKey, definition) {
  return {
    featureKey,
    temporary: definition.temporary === true,
    serverBacked: definition.serverBacked === true,
    serverCapabilityKey: definition.serverCapabilityKey ?? null,
    trackingIssue: definition.trackingIssue ?? null,
    removalCondition: definition.temporary === true ? definition.removalCondition ?? null : null,
  };
}

/**
 * @param {Record<string, any>} registry
 */
export function generateProductionExposureReport(registry) {
  const sections = {
    production: [],
    betaOnly: [],
    localOnly: [],
    disabled: [],
  };

  for (const [featureKey, definition] of Object.entries(registry)) {
    const entry = toFeatureEntry(featureKey, definition);
    const category = classifyFeatureExposure(definition);
    if (category === 'production') sections.production.push(entry);
    else if (category === 'beta-only') sections.betaOnly.push(entry);
    else if (category === 'local-only') sections.localOnly.push(entry);
    else sections.disabled.push(entry);
  }

  for (const list of Object.values(sections)) {
    list.sort((left, right) => left.featureKey.localeCompare(right.featureKey));
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      production: sections.production.length,
      betaOnly: sections.betaOnly.length,
      localOnly: sections.localOnly.length,
      disabled: sections.disabled.length,
    },
    sections,
  };
}

/**
 * @param {Record<string, any>} baseRegistry
 * @param {Record<string, any>} headRegistry
 */
export function findNewlyProductionVisible(baseRegistry, headRegistry) {
  const newlyVisible = [];

  for (const [featureKey, headDefinition] of Object.entries(headRegistry)) {
    const baseDefinition = baseRegistry[featureKey];
    const wasProduction = baseDefinition?.exposure?.production === true;
    const isProduction = headDefinition?.exposure?.production === true;
    if (!wasProduction && isProduction) {
      newlyVisible.push(toFeatureEntry(featureKey, headDefinition));
    }
  }

  return newlyVisible.sort((left, right) => left.featureKey.localeCompare(right.featureKey));
}

/**
 * @param {Record<string, any>} headRegistry
 * @param {Set<string>} [excludeFeatureKeys]
 */
function collectTemporaryProductionErrors(headRegistry, excludeFeatureKeys = new Set()) {
  const errors = [];
  for (const [featureKey, definition] of Object.entries(headRegistry)) {
    if (excludeFeatureKeys.has(featureKey)) continue;
    if (definition.temporary !== true || definition.exposure?.production !== true) continue;
    errors.push(
      `Temporary feature "${featureKey}" is exposed on production (#${definition.trackingIssue}).`
    );
  }
  return errors;
}

/**
 * @param {Record<string, any>} headRegistry
 * @param {Record<string, any>} baseRegistry
 */
function collectNewlyVisibleTemporaryErrors(headRegistry, baseRegistry) {
  const errors = [];
  for (const entry of findNewlyProductionVisible(baseRegistry, headRegistry)) {
    if (!entry.temporary) continue;
    errors.push(
      `Temporary feature "${entry.featureKey}" is newly production-visible (#${entry.trackingIssue}).`
    );
  }
  return errors;
}

/**
 * @param {Record<string, any>} headRegistry
 * @param {Record<string, any>} [baseRegistry]
 */
export function evaluateExperimentalLeakage(headRegistry, baseRegistry = {}) {
  const newlyVisibleTemporaryKeys = new Set(
    findNewlyProductionVisible(baseRegistry, headRegistry)
      .filter((entry) => entry.temporary)
      .map((entry) => entry.featureKey)
  );
  const errors = [
    ...collectTemporaryProductionErrors(headRegistry, newlyVisibleTemporaryKeys),
    ...collectNewlyVisibleTemporaryErrors(headRegistry, baseRegistry),
  ];
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

/**
 * @param {Record<string, any>} registry
 * @param {Record<string, any>} serverRegistry
 */
export function evaluateClientServerAlignment(registry, serverRegistry) {
  const errors = [];
  validateClientServerRegistryAlignment(registry, serverRegistry, errors);
  validateClientServerExposureMatrices(registry, serverRegistry, errors);
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

/** Policy wording for temporary production exposure overlaps with leakage checks. */
function isTemporaryProductionPolicyError(error) {
  return /^Temporary feature "[^"]+" is exposed on production\. Temporary features must not be enabled/u.test(
    error
  );
}

/**
 * @param {{
 *   headRegistry: Record<string, any>,
 *   baseRegistry?: Record<string, any>,
 *   policyResult: { ok: boolean, errors?: string[] },
 * }} context
 */
export function validatePromotionExposure({ headRegistry, baseRegistry = {}, policyResult }) {
  const leakage = evaluateExperimentalLeakage(headRegistry, baseRegistry);
  const policyErrors = policyResult.ok ? [] : (policyResult.errors ?? []);
  const errors = [
    ...(leakage.ok ? policyErrors : policyErrors.filter((error) => !isTemporaryProductionPolicyError(error))),
    ...(leakage.ok ? [] : leakage.errors),
  ];

  const uniqueErrors = [...new Set(errors)];
  return uniqueErrors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: uniqueErrors };
}

/**
 * @param {string[]} errors
 * @param {number} [maxLength]
 */
export function summarizeErrors(errors, maxLength = 160) {
  if (!errors.length) return '—';
  const combined = errors.join('; ');
  if (combined.length <= maxLength) return combined;
  return `${combined.slice(0, maxLength - 1)}…`;
}

/**
 * @param {{ featureKey: string }[]} entries
 */
export function formatFeatureList(entries) {
  if (!entries.length) return '—';
  const names = entries.map((entry) => entry.featureKey);
  if (names.length <= 5) return `${names.join(', ')} (${names.length})`;
  return `${names.slice(0, 4).join(', ')}, … (${names.length})`;
}

/**
 * @param {string} title
 * @param {{ featureKey: string }[]} entries
 */
function formatReportSection(title, entries) {
  const lines = [`${title}:`];
  if (entries.length === 0) {
    lines.push('  (none)');
  } else {
    lines.push(...entries.map((entry) => `  ${entry.featureKey}`));
  }
  return lines;
}

/**
 * @param {{
 *   report: ReturnType<typeof generateProductionExposureReport>,
 *   newlyProductionVisible: ReturnType<typeof findNewlyProductionVisible>,
 * }} context
 */
export function formatExposureReport({ report, newlyProductionVisible }) {
  return [
    ...formatReportSection('Production-enabled', report.sections.production),
    '',
    ...formatReportSection('Beta-only', report.sections.betaOnly),
    '',
    ...formatReportSection('Disabled everywhere except local', report.sections.localOnly),
    '',
    ...formatReportSection('Disabled', report.sections.disabled),
    '',
    ...formatReportSection('Newly production-visible (vs main)', newlyProductionVisible),
  ].join('\n');
}

/**
 * @param {{
 *   policyResult: { ok: boolean, errors?: string[] },
 *   leakageResult: { ok: boolean, errors?: string[] },
 *   alignmentResult: { ok: boolean, errors?: string[] },
 *   promotionResult: { ok: boolean, errors?: string[] },
 *   registry: Record<string, any>,
 * }} context
 */
export function buildPromotionCheckRows({
  policyResult,
  leakageResult,
  alignmentResult,
  promotionResult,
  registry,
}) {
  const featureCount = Object.keys(registry).length;

  return [
    {
      name: 'Registry policy (FND-06)',
      ok: policyResult.ok,
      details: policyResult.ok
        ? `${featureCount} features validated`
        : summarizeErrors(policyResult.errors ?? []),
    },
    {
      name: 'No experimental leakage to production',
      ok: leakageResult.ok,
      details: leakageResult.ok ? '—' : summarizeErrors(leakageResult.errors ?? []),
    },
    {
      name: 'Client/server exposure alignment',
      ok: alignmentResult.ok,
      details: alignmentResult.ok ? '—' : summarizeErrors(alignmentResult.errors ?? []),
    },
    {
      name: '**Overall**',
      ok: promotionResult.ok,
      details: promotionResult.ok ? 'Ready to promote' : summarizeErrors(promotionResult.errors ?? []),
    },
  ];
}
