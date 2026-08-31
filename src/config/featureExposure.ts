import { BUILD_TARGETS, type BuildTarget, getBuildTarget } from './buildTarget';

export type FeatureExposureMatrix = Record<BuildTarget, boolean>;

type FeatureExposureBase = {
  exposure: FeatureExposureMatrix;
  owner: string;
  addedDate: string;
  trackingIssue?: number;
};

type ServerBackedMetadata =
  | { serverBacked: true; serverCapabilityKey: string }
  | { serverBacked: false; serverCapabilityKey?: never };

export type TemporaryFeatureExposureDefinition = FeatureExposureBase & {
  temporary: true;
  removalCondition: string;
} & ServerBackedMetadata;

export type PermanentFeatureExposureDefinition = FeatureExposureBase & {
  temporary: false;
  serverBacked: false;
  serverCapabilityKey?: never;
};

export type FeatureExposureDefinition =
  | TemporaryFeatureExposureDefinition
  | PermanentFeatureExposureDefinition;

const ALL_TARGETS_OFF: FeatureExposureMatrix = {
  local: false,
  beta: false,
  staging: false,
  production: false,
};

const ALL_TARGETS_ON: FeatureExposureMatrix = {
  local: true,
  beta: true,
  staging: true,
  production: true,
};

const CORE_PRODUCT_OWNER = 'WxboySuper';
const CORE_PRODUCT_ADDED_DATE = '2026-06-21';

/** Single source of truth for v1.7 feature exposure and lifecycle metadata. */
export const FEATURE_EXPOSURE_REGISTRY = {
  exportMap: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  saveLoad: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  tornadoOutlook: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  windOutlook: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  hailOutlook: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  categoricalOutlook: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  significantThreats: {
    exposure: { ...ALL_TARGETS_ON },
    owner: CORE_PRODUCT_OWNER,
    addedDate: CORE_PRODUCT_ADDED_DATE,
    temporary: false,
    serverBacked: false,
    trackingIssue: 440,
  },
  autoTstm: {
    exposure: { ...ALL_TARGETS_ON },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition:
      'Remove after Auto-TSTM client and server gates ship and the stable production rollout completes (#427). The v1.7 release exposes the completed workflow on every release target.',
    serverBacked: true,
    serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
    trackingIssue: 427,
  },
  forecastWorkflowV2: {
    exposure: { ...ALL_TARGETS_ON },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after forecast workflow v2 replaces the current cycle workflow (#429).',
    serverBacked: false,
    trackingIssue: 429,
  },
  verificationRelaunch: {
    exposure: { ...ALL_TARGETS_ON },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after verification analytics relaunch reaches production (#430).',
    serverBacked: false,
    trackingIssue: 430,
  },
  customProducts: {
    exposure: { ...ALL_TARGETS_ON },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after custom layers and premium forecast products complete their production rollout (#431).',
    serverBacked: false,
    trackingIssue: 431,
  },
  outlookLandMasking: {
    exposure: {
      local: true,
      beta: true,
      staging: false,
      production: false,
    },
    owner: 'WxboySuper',
    addedDate: '2026-08-27',
    temporary: true,
    removalCondition:
      'Remove after land masking is validated by beta testers and the stable production rollout is approved (#619).',
    serverBacked: false,
    trackingIssue: 619,
  },
  tropicalWorkspace: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition:
      'Keep disabled on production until tropical workspace foundations are complete (#432).',
    serverBacked: false,
    trackingIssue: 432,
  },
  mesoscaleWorkspace: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-08-28',
    temporary: true,
    removalCondition:
      'Remove after the Mesoscale Forecast workspace and provider contract complete their staged rollout (#919).',
    serverBacked: false,
    trackingIssue: 919,
  },
  winterWorkspace: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-08-28',
    temporary: true,
    removalCondition: 'Keep disabled until a future Winter workspace release is approved.',
    serverBacked: false,
    trackingIssue: 913,
  },
  collaborationRoom: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after forecast collaboration room foundations ship (#433).',
    serverBacked: false,
    trackingIssue: 433,
  },
  paintBucketTool: {
    exposure: {
      local: true,
      beta: true,
      staging: false,
      production: false,
    },
    owner: 'WxboySuper',
    addedDate: '2026-08-18',
    temporary: true,
    removalCondition:
      'Remove strategy selector after paint-bucket interaction is validated by beta testers and the stable production rollout is approved (#623).',
    serverBacked: false,
    trackingIssue: 623,
  },
  kmzExport: {
    exposure: { local: true, beta: true, staging: false, production: false },
    owner: 'WxboySuper',
    addedDate: '2026-08-18',
    temporary: true,
    removalCondition: 'Promote after KMZ export prototype validation and consumer testing (#621).',
    serverBacked: false,
    trackingIssue: 621,
  },
  populationEstimate: {
    exposure: {
      local: true,
      beta: true,
      staging: false,
      production: false,
    },
    owner: 'WxboySuper',
    addedDate: '2026-08-28',
    temporary: true,
    removalCondition:
      'Remove after the WorldPop population estimate prototype is validated by beta testers and a permanent product decision is made (#622).',
    serverBacked: false,
    trackingIssue: 622,
  },
} as const satisfies Record<string, FeatureExposureDefinition>;

export type FeatureKey = keyof typeof FEATURE_EXPOSURE_REGISTRY;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FeatureValidationContext = {
  featureKey: string;
  definition: FeatureExposureDefinition;
};

/** Returns true when addedDate is a real YYYY-MM-DD calendar value. */
function isValidIsoCalendarDate(addedDate: string): boolean {
  if (!ISO_DATE_PATTERN.test(addedDate)) {
    return false;
  }

  const [year, month, day] = addedDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Ensures every build target has a boolean exposure value. */
function assertExposureMatrix({ featureKey, definition }: FeatureValidationContext): void {
  for (const target of BUILD_TARGETS) {
    if (typeof definition.exposure[target] !== 'boolean') {
      throw new Error(`Feature ${featureKey} is missing exposure for target ${target}.`);
    }
  }
}

/** Ensures addedDate uses a real ISO calendar date. */
function assertAddedDate({ featureKey, definition }: FeatureValidationContext): void {
  if (!isValidIsoCalendarDate(definition.addedDate)) {
    throw new Error(
      `Feature ${featureKey} has an invalid addedDate ${JSON.stringify(definition.addedDate)}.`
    );
  }
}

/** Ensures temporary features declare when they should be removed. */
function assertTemporaryMetadata({ featureKey, definition }: FeatureValidationContext): void {
  if (definition.temporary && definition.removalCondition.trim().length === 0) {
    throw new Error(`Temporary feature ${featureKey} must declare a removalCondition.`);
  }
}

/** Ensures server-backed metadata matches the declared capability key. */
function assertServerBackedMetadata({ featureKey, definition }: FeatureValidationContext): void {
  if (definition.serverBacked && !definition.serverCapabilityKey?.trim()) {
    throw new Error(`Server-backed feature ${featureKey} must declare serverCapabilityKey.`);
  }

  if (!definition.serverBacked && definition.serverCapabilityKey) {
    throw new Error(`Feature ${featureKey} must not declare serverCapabilityKey when serverBacked is false.`);
  }
}

/** Runs every registry lifecycle assertion for one feature entry. */
function assertFeatureExposureDefinition(featureKey: string, definition: FeatureExposureDefinition): void {
  const context: FeatureValidationContext = { featureKey, definition };

  assertExposureMatrix(context);
  assertAddedDate(context);
  assertTemporaryMetadata(context);
  assertServerBackedMetadata(context);
}

/** Validates registry shape and lifecycle metadata for tests and future CI policy checks. */
export const validateFeatureExposureRegistry = (
  registry: Record<string, FeatureExposureDefinition> = FEATURE_EXPOSURE_REGISTRY
): void => {
  for (const [featureKey, definition] of Object.entries(registry)) {
    assertFeatureExposureDefinition(featureKey, definition);
  }
};

validateFeatureExposureRegistry();

/** Returns every typed feature key declared in the registry. */
export const getFeatureKeys = (): FeatureKey[] =>
  Object.keys(FEATURE_EXPOSURE_REGISTRY) as FeatureKey[];

/** Returns the full registry entry for diagnostics and governance tooling. */
export const getFeatureExposure = (feature: FeatureKey): FeatureExposureDefinition =>
  FEATURE_EXPOSURE_REGISTRY[feature];

/** Returns whether a feature is exposed for the given deployment target. */
export const isFeatureExposedOnTarget = (feature: FeatureKey, target: BuildTarget): boolean =>
  FEATURE_EXPOSURE_REGISTRY[feature].exposure[target];

/** Returns whether a feature is exposed on the current build target. */
export const isFeatureExposed = (feature: FeatureKey, target: BuildTarget = getBuildTarget()): boolean =>
  isFeatureExposedOnTarget(feature, target);
