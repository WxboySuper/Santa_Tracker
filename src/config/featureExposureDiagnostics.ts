import { type BuildTarget, getBuildTarget } from './buildTarget';
import {
  getFeatureExposure,
  getFeatureKeys,
  isFeatureExposedOnTarget,
  type FeatureExposureDefinition,
  type FeatureKey,
} from './featureExposure';
import type { CapabilityAvailabilityReason, CapabilityStatusEntry } from './serverCapabilityStatus';

export type FeatureExposureResolutionReason =
  | 'available'
  | 'target_policy'
  | 'emergency_disabled'
  | 'deployment_disabled'
  | 'server_capability_unavailable'
  | 'entitlement';

export type FeatureExposureDiagnostic = {
  featureKey: string;
  buildTarget: BuildTarget;
  lifecycle: 'temporary' | 'permanent';
  registryExposed: boolean;
  resolvedExposed: boolean;
  reason: FeatureExposureResolutionReason;
  serverCapability?: {
    key: string;
    serverReason: CapabilityAvailabilityReason;
    agreesWithClient: boolean;
  };
  owner?: string;
  trackingIssue?: number;
  removalCondition?: string;
};

export type EntitlementSnapshot = {
  premiumActive: boolean;
};

export type ServerStatusSnapshot = {
  loaded: boolean;
  capabilities: Record<string, CapabilityStatusEntry>;
};

export type FeatureExposureDiagnosticResolveOptions = {
  buildTarget?: BuildTarget;
  serverStatus?: ServerStatusSnapshot;
  entitlement?: EntitlementSnapshot;
  includeInternalMetadata?: boolean;
  /** Test-only override when simulating entitlement-gated features. */
  entitlementRequired?: boolean;
};

type MaintainerDiagnosticFields = Pick<
  FeatureExposureDiagnostic,
  'owner' | 'trackingIssue' | 'removalCondition'
>;

/** Returns true when the local dev diagnostics page may register a route. */
export const isFeatureExposureDiagnosticsEnabled = (): boolean =>
  __GFC_DEV_MODE__ && getBuildTarget() === 'local';

/** Maps public server capability reasons into feature exposure resolution reasons. */
export const mapServerReasonToResolution = (
  reason: CapabilityAvailabilityReason
): FeatureExposureResolutionReason => {
  switch (reason) {
    case 'available':
      return 'available';
    case 'registry_disabled':
      return 'target_policy';
    case 'emergency_disabled':
      return 'emergency_disabled';
    case 'deployment_disabled':
      return 'deployment_disabled';
    case 'unknown':
    default:
      return 'server_capability_unavailable';
  }
};

/** Returns maintainer lifecycle metadata when explicitly requested. */
export const getMaintainerDiagnosticFields = (
  definition: FeatureExposureDefinition,
  includeInternalMetadata: boolean
): MaintainerDiagnosticFields => {
  if (!includeInternalMetadata) {
    return {};
  }

  return {
    owner: definition.owner,
    trackingIssue: definition.trackingIssue,
    removalCondition: definition.temporary ? definition.removalCondition : undefined,
  };
};

/** Returns whether premium entitlement must be active for this feature. */
function isEntitlementRequired(
  definition: FeatureExposureDefinition,
  entitlementRequired?: boolean
): boolean {
  if (entitlementRequired !== undefined) {
    return entitlementRequired;
  }

  return (
    'entitlementRequired' in definition &&
    (definition as FeatureExposureDefinition & { entitlementRequired?: boolean }).entitlementRequired ===
      true
  );
}

/** Resolves server-backed exposure using the latest capability status snapshot. */
function resolveServerBackedDiagnostic(
  capabilityKey: string,
  serverStatus: ServerStatusSnapshot | undefined,
  entitlementBlocked: boolean
): Pick<FeatureExposureDiagnostic, 'resolvedExposed' | 'reason' | 'serverCapability'> {
  if (!serverStatus?.loaded) {
    return {
      resolvedExposed: false,
      reason: 'server_capability_unavailable',
      serverCapability: {
        key: capabilityKey,
        serverReason: 'unknown',
        agreesWithClient: true,
      },
    };
  }

  const entry = serverStatus.capabilities[capabilityKey];
  if (!entry) {
    return {
      resolvedExposed: false,
      reason: 'server_capability_unavailable',
      serverCapability: {
        key: capabilityKey,
        serverReason: 'unknown',
        agreesWithClient: true,
      },
    };
  }

  const reason = mapServerReasonToResolution(entry.reason);
  if (reason !== 'available') {
    return {
      resolvedExposed: false,
      reason,
      serverCapability: {
        key: capabilityKey,
        serverReason: entry.reason,
        agreesWithClient: true,
      },
    };
  }

  if (entitlementBlocked) {
    return {
      resolvedExposed: false,
      reason: 'entitlement',
      serverCapability: {
        key: capabilityKey,
        serverReason: entry.reason,
        agreesWithClient: false,
      },
    };
  }

  return {
    resolvedExposed: true,
    reason: 'available',
    serverCapability: {
      key: capabilityKey,
      serverReason: entry.reason,
      agreesWithClient: true,
    },
  };
}

/** Resolves one registry feature into a maintainer-facing diagnostic record. */
export const resolveFeatureExposureDiagnostic = (
  feature: FeatureKey,
  options: FeatureExposureDiagnosticResolveOptions = {}
): FeatureExposureDiagnostic => {
  const buildTarget = options.buildTarget ?? getBuildTarget();
  const definition = getFeatureExposure(feature);
  const registryExposed = isFeatureExposedOnTarget(feature, buildTarget);
  const lifecycle = definition.temporary ? 'temporary' : 'permanent';
  const maintainerFields = getMaintainerDiagnosticFields(
    definition,
    options.includeInternalMetadata === true
  );
  const entitlementBlocked =
    isEntitlementRequired(definition, options.entitlementRequired) &&
    options.entitlement?.premiumActive !== true;

  if (!registryExposed) {
    return {
      featureKey: feature,
      buildTarget,
      lifecycle,
      registryExposed,
      resolvedExposed: false,
      reason: 'target_policy',
      ...maintainerFields,
    };
  }

  if (definition.serverBacked) {
    const serverDiagnostic = resolveServerBackedDiagnostic(
      definition.serverCapabilityKey,
      options.serverStatus,
      entitlementBlocked
    );

    return {
      featureKey: feature,
      buildTarget,
      lifecycle,
      registryExposed,
      ...serverDiagnostic,
      ...maintainerFields,
    };
  }

  if (entitlementBlocked) {
    return {
      featureKey: feature,
      buildTarget,
      lifecycle,
      registryExposed,
      resolvedExposed: false,
      reason: 'entitlement',
      ...maintainerFields,
    };
  }

  return {
    featureKey: feature,
    buildTarget,
    lifecycle,
    registryExposed,
    resolvedExposed: true,
    reason: 'available',
    ...maintainerFields,
  };
};

/** Resolves every registry feature in stable feature-key order. */
export const resolveAllFeatureExposureDiagnostics = (
  options: FeatureExposureDiagnosticResolveOptions = {}
): FeatureExposureDiagnostic[] =>
  getFeatureKeys()
    .sort((left, right) => left.localeCompare(right))
    .map((featureKey) => resolveFeatureExposureDiagnostic(featureKey, options));
