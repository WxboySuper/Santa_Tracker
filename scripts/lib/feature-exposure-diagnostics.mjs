import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { CAPABILITY_REASON, resolveCapabilityAvailability } = require('../../server/lib/capabilityStatus.js');

const BUILD_TARGETS = ['local', 'beta', 'staging', 'production'];

const SERVER_REASON_TO_RESOLUTION = {
  [CAPABILITY_REASON.AVAILABLE]: 'available',
  [CAPABILITY_REASON.REGISTRY_DISABLED]: 'target_policy',
  [CAPABILITY_REASON.EMERGENCY_DISABLED]: 'emergency_disabled',
  [CAPABILITY_REASON.DEPLOYMENT_DISABLED]: 'deployment_disabled',
  [CAPABILITY_REASON.UNKNOWN]: 'server_capability_unavailable',
};

/** @param {string} reason */
export function mapServerReasonToResolution(reason) {
  return SERVER_REASON_TO_RESOLUTION[reason] ?? 'server_capability_unavailable';
}

/** @param {string} target */
export function assertBuildTarget(target) {
  if (!BUILD_TARGETS.includes(target)) {
    throw new Error(
      `Invalid build target ${JSON.stringify(target)}. Expected one of: ${BUILD_TARGETS.join(', ')}.`
    );
  }
}

/**
 * @param {Record<string, any>} definition
 * @param {boolean} includeInternalMetadata
 */
export function getMaintainerDiagnosticFields(definition, includeInternalMetadata) {
  if (!includeInternalMetadata) {
    return {};
  }

  return {
    owner: definition.owner,
    trackingIssue: definition.trackingIssue ?? undefined,
    removalCondition: definition.temporary === true ? definition.removalCondition : undefined,
  };
}

/**
 * @param {Record<string, any>} definition
 * @param {boolean | undefined} entitlementRequiredOverride
 */
function isEntitlementRequired(definition, entitlementRequiredOverride) {
  if (entitlementRequiredOverride !== undefined) {
    return entitlementRequiredOverride;
  }

  return definition.entitlementRequired === true;
}

/**
 * @param {string} featureKey
 * @param {Record<string, any>} definition
 * @param {{
 *   target: string,
 *   env: Record<string, string | undefined>,
 *   includeInternalMetadata: boolean,
 *   entitlement?: { premiumActive: boolean },
 *   entitlementRequired?: boolean,
 * }} options
 */
export function resolveFeatureExposureDiagnostic(featureKey, definition, options) {
  const registryExposed = definition.exposure[options.target] === true;
  const lifecycle = definition.temporary === true ? 'temporary' : 'permanent';
  const maintainerFields = getMaintainerDiagnosticFields(
    definition,
    options.includeInternalMetadata
  );
  const entitlementBlocked =
    isEntitlementRequired(definition, options.entitlementRequired) &&
    options.entitlement?.premiumActive !== true;

  const base = {
    featureKey,
    buildTarget: options.target,
    lifecycle,
    registryExposed,
    ...maintainerFields,
  };

  if (!registryExposed) {
    return {
      ...base,
      resolvedExposed: false,
      reason: 'target_policy',
    };
  }

  if (definition.serverBacked === true) {
    const capabilityKey = definition.serverCapabilityKey;
    const serverStatus = resolveCapabilityAvailability(capabilityKey, {
      env: options.env,
      target: options.target,
      exposureOverride: { [options.target]: true },
    });
    const reason = mapServerReasonToResolution(serverStatus.reason);

    if (reason !== 'available') {
      return {
        ...base,
        resolvedExposed: false,
        reason,
        serverCapability: {
          key: capabilityKey,
          serverReason: serverStatus.reason,
          agreesWithClient: true,
        },
      };
    }

    if (entitlementBlocked) {
      return {
        ...base,
        resolvedExposed: false,
        reason: 'entitlement',
        serverCapability: {
          key: capabilityKey,
          serverReason: serverStatus.reason,
          agreesWithClient: false,
        },
      };
    }

    return {
      ...base,
      resolvedExposed: true,
      reason: 'available',
      serverCapability: {
        key: capabilityKey,
        serverReason: serverStatus.reason,
        agreesWithClient: true,
      },
    };
  }

  if (entitlementBlocked) {
    return {
      ...base,
      resolvedExposed: false,
      reason: 'entitlement',
    };
  }

  return {
    ...base,
    resolvedExposed: true,
    reason: 'available',
  };
}

/**
 * @param {Record<string, any>} registry
 * @param {{
 *   target: string,
 *   env?: Record<string, string | undefined>,
 *   includeInternalMetadata?: boolean,
 *   entitlement?: { premiumActive: boolean },
 *   entitlementRequired?: boolean,
 * }} options
 */
export function resolveAllFeatureExposureDiagnostics(registry, options) {
  const env = options.env ?? process.env;
  const includeInternalMetadata = options.includeInternalMetadata === true;

  return Object.keys(registry)
    .sort((left, right) => left.localeCompare(right))
    .map((featureKey) =>
      resolveFeatureExposureDiagnostic(featureKey, registry[featureKey], {
        target: options.target,
        env,
        includeInternalMetadata,
        entitlement: options.entitlement,
        entitlementRequired: options.entitlementRequired,
      })
    );
}

/**
 * @param {{ registry: Record<string, any> }} inputs
 * @param {{
 *   target: string,
 *   env?: Record<string, string | undefined>,
 *   includeInternalMetadata?: boolean,
 * }} options
 * @returns {{ generatedAt: string, buildTarget: string, features: ReturnType<typeof resolveAllFeatureExposureDiagnostics> }}
 */
export function generateFeatureExposureDiagnostics(inputs, options) {
  assertBuildTarget(options.target);
  const generatedAt = new Date().toISOString();

  const diagnostics = resolveAllFeatureExposureDiagnostics(inputs.registry, {
    target: options.target,
    env: {
      ...process.env,
      SERVER_TARGET: options.target,
      ...(options.env ?? {}),
    },
    includeInternalMetadata: options.includeInternalMetadata,
  });

  return {
    generatedAt,
    buildTarget: options.target,
    features: diagnostics,
  };
}

/** @param {ReturnType<typeof generateFeatureExposureDiagnostics>} report */
export function serializeFeatureExposureDiagnostics(report) {
  return JSON.stringify(report, null, 2);
}

/** @param {string} value */
function stripMatchingQuotes(value) {
  const match = /^(['"])(.*)\1$/u.exec(value);
  return match ? match[2] : value;
}

/**
 * @param {string} envFilePath
 * @returns {Record<string, string>}
 */
export function loadEnvFile(envFilePath) {
  const absolutePath = resolve(envFilePath);
  const contents = readFileSync(absolutePath, 'utf8');
  const env = {};

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    env[key] = stripMatchingQuotes(trimmed.slice(separatorIndex + 1).trim());
  }

  return env;
}
