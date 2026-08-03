/**
 * Deterministic feature exposure policy evaluation.
 *
 * Pure-JS validation that runs in CI without TypeScript compilation.
 * The CI entry point (validate-feature-exposure.mjs) extracts registry
 * and surface data from source files, then passes it here.
 */

import {
  validateClientServerExposureMatrices,
  validateClientServerRegistryAlignment,
} from './feature-exposure-policy-alignment.mjs';
import { validateExposureTestContract, validateV17WorkstreamAdoption } from './feature-exposure-policy-contract.mjs';

/**
 * @typedef {{ ok: true }} PolicyOk
 * @typedef {{ ok: false, errors: string[] }} PolicyFail
 * @typedef {PolicyOk | PolicyFail} PolicyResult
 * @typedef {{
 *   gatedRoutes: { feature: string }[],
 *   navigationItems: { feature?: string }[]
 * }} FeatureSurfaces
 * @typedef {{
 *   serverCapabilityKeys?: string[],
 *   serverRegistry?: Record<string, any>,
 *   sideEffectModules?: Record<string, readonly string[]>,
 *   acknowledgements?: Record<string, { reason?: string, trackingIssue?: number }>,
 *   existingTestFiles?: string[]
 * }} FeatureExposurePolicyOptions
 */

const BUILD_TARGET_LIST = ['local', 'beta', 'staging', 'production'];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true when addedDate is a real YYYY-MM-DD calendar value. */
function isValidIsoCalendarDate(addedDate) {
  if (!ISO_DATE_PATTERN.test(addedDate)) return false;
  const [year, month, day] = addedDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Adds exposure matrix violations for one feature. */
function validateExposureMatrix(featureKey, definition, errors) {
  for (const target of BUILD_TARGET_LIST) {
    if (typeof definition.exposure?.[target] !== 'boolean') {
      errors.push(`Feature "${featureKey}" is missing exposure for target "${target}".`);
    }
  }
}

/** Adds lifecycle metadata violations for one feature. */
function validateLifecycleMetadata(featureKey, definition, errors) {
  if (!isValidIsoCalendarDate(definition.addedDate)) {
    errors.push(`Feature "${featureKey}" has an invalid addedDate ${JSON.stringify(definition.addedDate)}.`);
  }
  if (definition.temporary && !definition.removalCondition?.trim()) {
    errors.push(`Temporary feature "${featureKey}" must declare a removalCondition.`);
  }
  if (typeof definition.trackingIssue !== 'number' || definition.trackingIssue <= 0) {
    errors.push(`Feature "${featureKey}" must declare a positive trackingIssue number.`);
  }
}

/** Adds server capability metadata violations for one feature. */
function validateServerMetadata(featureKey, definition, errors) {
  if (definition.serverBacked && !definition.serverCapabilityKey?.trim()) {
    errors.push(`Server-backed feature "${featureKey}" must declare serverCapabilityKey.`);
  }
  if (!definition.serverBacked && definition.serverCapabilityKey) {
    errors.push(`Feature "${featureKey}" must not declare serverCapabilityKey when serverBacked is false.`);
  }
}

/** Adds all registry-entry violations. */
function validateRegistryEntries(registry, errors) {
  for (const [featureKey, definition] of Object.entries(registry)) {
    validateExposureMatrix(featureKey, definition, errors);
    validateLifecycleMetadata(featureKey, definition, errors);
    validateServerMetadata(featureKey, definition, errors);
  }
}

/** Adds references to surface features missing from the registry. */
function validateSurfaceReferences(registry, surfaces, errors) {
  const registryKeys = new Set(Object.keys(registry));
  const features = new Set([
    ...surfaces.gatedRoutes.map(({ feature }) => feature),
    ...surfaces.navigationItems.map(({ feature }) => feature).filter(Boolean),
  ]);
  for (const featureKey of features) {
    if (!registryKeys.has(featureKey)) {
      errors.push(`Surface feature "${featureKey}" is referenced in routes/navigation but does not exist in the feature exposure registry.`);
    }
  }
}

/** Adds side-effect module references to unknown registry keys. */
function validateSideEffectModuleReferences(registry, sideEffectModules, errors) {
  const registryKeys = new Set(Object.keys(registry));
  for (const featureKey of Object.keys(sideEffectModules)) {
    if (!registryKeys.has(featureKey)) {
      errors.push(`Side-effect module references unknown feature "${featureKey}".`);
    }
  }
}

/** Adds server-backed registry entries that lack a matching server capability. */
function validateServerCapabilities(registry, serverCapabilityKeys, errors) {
  for (const [featureKey, definition] of Object.entries(registry)) {
    if (!definition.serverBacked) continue;
    if (!definition.serverCapabilityKey) continue;
    if (serverCapabilityKeys.includes(definition.serverCapabilityKey)) continue;
    errors.push(`Feature "${featureKey}" declares serverCapabilityKey "${definition.serverCapabilityKey}" but it is not in the server capability keys list.`);
  }
}

/** Adds temporary features that are prematurely exposed in production. */
function validateProductionSafety(registry, errors) {
  for (const [featureKey, definition] of Object.entries(registry)) {
    if (definition.temporary && definition.exposure?.production === true) {
      errors.push(`Temporary feature "${featureKey}" is exposed on production. Temporary features must not be enabled on production until explicitly promoted.`);
    }
  }
}

/** Converts collected violations into the public policy result shape. */
function createPolicyResult(errors) {
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validates the feature exposure registry and cross-file surface references.
 *
 * @param {Record<string, any>} registry — the FEATURE_EXPOSURE_REGISTRY
 * @param {FeatureSurfaces} surfaces
 * @param {FeatureExposurePolicyOptions | string[]} [options] — policy options or legacy serverCapabilityKeys array
 * @returns {PolicyResult}
 */
export function evaluateFeatureExposurePolicy(registry, surfaces, options = {}) {
  const normalizedOptions = Array.isArray(options)
    ? { serverCapabilityKeys: options }
    : options;

  const {
    serverCapabilityKeys = [],
    serverRegistry = {},
    sideEffectModules = {},
    acknowledgements = {},
    existingTestFiles = [],
    requireV17WorkstreamRegistry = false,
  } = normalizedOptions;

  const errors = [];
  validateRegistryEntries(registry, errors);
  validateSurfaceReferences(registry, surfaces, errors);
  validateSideEffectModuleReferences(registry, sideEffectModules, errors);
  validateServerCapabilities(registry, serverCapabilityKeys, errors);
  validateClientServerRegistryAlignment(registry, serverRegistry, errors);
  validateClientServerExposureMatrices(registry, serverRegistry, errors);
  validateExposureTestContract(
    { surfaces, sideEffectModules, acknowledgements, existingTestFiles },
    errors
  );
  validateV17WorkstreamAdoption(
    registry,
    { surfaces, sideEffectModules, acknowledgements, existingTestFiles },
    errors,
    { requireV17WorkstreamRegistry }
  );
  validateProductionSafety(registry, errors);
  return createPolicyResult(errors);
}
