import type {
  Package,
  CycleMetadata,
  WorkflowPackageMetadata,
  CycleId,
  WorkflowId,
  CycleStatus,
  OutlookVersion,
  Grouping,
  SerializedCycle,
  SerializedWorkflowPackage,
  SerializedOutlookVersionData,
} from '../types/workflow';
import type {
  GFCForecastSaveData,
  DayType,
  DiscussionData,
} from '../types/outlooks';
import { WORKFLOW_SCHEMA_VERSION } from '../types/workflow';
import { isFeatureExposed } from '../config/featureExposure';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default workflow ID used when migrating legacy data with no explicit workflow context. */
const DEFAULT_WORKFLOW_ID = 'default';

/** Maps numeric DayType to the grouping key used in serialized output. */
const dayToGrouping = (day: DayType): Grouping => {
  if (day <= 3) return `day${day}` as Grouping;
  return 'day4-8' as Grouping;
};

/** Generates a deterministic CycleId from workflow + date. */
const makeCycleId = (workflowId: WorkflowId, cycleDate: string): CycleId =>
  `WF-${workflowId}-${cycleDate}`;

/** Returns populated legacy day entries in stable iteration order. */
const getLegacyDayEntries = (
  legacyData: GFCForecastSaveData,
): Array<{ day: DayType; savedDay: NonNullable<NonNullable<GFCForecastSaveData['forecastCycle']>['days'][DayType]> }> => {
  if (!legacyData.forecastCycle?.days) {
    return [];
  }

  return (Object.values(legacyData.forecastCycle.days) as Array<NonNullable<GFCForecastSaveData['forecastCycle']>['days'][DayType]>)
    .filter((savedDay): savedDay is NonNullable<typeof savedDay> => Boolean(savedDay))
    .map((savedDay) => ({ day: savedDay.day, savedDay }));
};

/** Maps a serialized cycle into runtime cycle metadata. */
const toCycleMetadata = (serializedCycle: SerializedCycle): CycleMetadata => ({
  id: serializedCycle.id,
  workflowId: serializedCycle.workflowId,
  cycleDate: serializedCycle.cycleDate,
  status: serializedCycle.status,
  outlookVersions: serializedCycle.outlookVersions,
  createdAt: serializedCycle.createdAt,
  updatedAt: serializedCycle.updatedAt,
});

/** Builds one completed outlook version per legacy day entry. */
const buildOutlookVersions = (
  legacyData: GFCForecastSaveData,
  createdAt: string,
): OutlookVersion[] => {
  const outlookVersions: OutlookVersion[] = [];
  let versionCounter = 1;

  getLegacyDayEntries(legacyData).forEach(() => {
    outlookVersions.push({
      version: versionCounter++,
      status: 'completed',
      createdAt,
    });
  });

  if (outlookVersions.length === 0) {
    outlookVersions.push({
      version: 1,
      status: 'completed',
      createdAt,
    });
  }

  return outlookVersions;
};

/** Builds grouping payloads keyed by grouping version, keeping the first day per grouping. */
const buildGroupingData = (
  legacyData: GFCForecastSaveData,
): Record<string, SerializedOutlookVersionData> => {
  const groupingData: Record<string, SerializedOutlookVersionData> = {};

  getLegacyDayEntries(legacyData).forEach(({ day, savedDay }) => {
    const grouping = dayToGrouping(day);
    const groupingKey = `${grouping}-v1`;
    if (groupingData[groupingKey]) {
      return;
    }

    groupingData[groupingKey] = {
      day,
      data: savedDay.data,
      ...(isFeatureExposed('customProducts') && savedDay.customLayers
        ? { customLayers: JSON.parse(JSON.stringify(savedDay.customLayers)) as typeof savedDay.customLayers }
        : {}),
      metadata: {
        issueDate: savedDay.metadata.issueDate,
        validDate: savedDay.metadata.validDate,
        issuanceTime: savedDay.metadata.issuanceTime,
        lowProbabilityOutlooks: savedDay.metadata.lowProbabilityOutlooks,
      },
      discussion: (savedDay as { discussion?: DiscussionData }).discussion,
    };
  });

  return groupingData;
};

/** Builds unique grouping entries, keeping the first day per grouping. */
const buildGroupings = (legacyData: GFCForecastSaveData): { grouping: Grouping; day: DayType }[] => {
  const seenGroupings = new Set<string>();
  const groupings: { grouping: Grouping; day: DayType }[] = [];

  getLegacyDayEntries(legacyData).forEach(({ day }) => {
    const grouping = dayToGrouping(day);
    if (seenGroupings.has(grouping)) {
      return;
    }

    seenGroupings.add(grouping);
    groupings.push({ grouping, day });
  });

  return groupings;
};

/** Type guard for serialized workflow package metadata. */
const isWorkflowPackageMetadata = (value: unknown): value is WorkflowPackageMetadata => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const metadata = value as Partial<WorkflowPackageMetadata>;
  return typeof metadata.workflowId === 'string' && typeof metadata.cycleId === 'string';
};

/** Type guard for serialized cycle payloads. */
const isSerializedCycle = (value: unknown): value is SerializedCycle => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const cycle = value as Partial<SerializedCycle>;
  return (
    typeof cycle.id === 'string' &&
    typeof cycle.workflowId === 'string' &&
    Array.isArray(cycle.outlookVersions)
  );
};

// ---------------------------------------------------------------------------
// serializeWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Converts a runtime `Package` (cycles + metadata) into a JSON-serializable
 * `SerializedWorkflowPackage`.
 *
 * The caller is responsible for populating `styleSnapshots` if desired.
 */
export const serializeWorkflowPackage = (
  pkg: Package,
): SerializedWorkflowPackage => {
  const serializedCycles: SerializedCycle[] = pkg.cycles.map((cycle) => ({
    id: cycle.id,
    workflowId: cycle.workflowId,
    cycleDate: cycle.cycleDate,
    status: cycle.status,
    outlookVersions: cycle.outlookVersions,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
    groupings: [],
    groupingData: {},
  }));

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    version: String(pkg.metadata.version),
    metadata: pkg.metadata,
    cycles: serializedCycles,
  };
};

// ---------------------------------------------------------------------------
// deserializeWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Rehydrates a `SerializedWorkflowPackage` back into a runtime `Package`.
 *
 * Grouping payloads remain in the serialized shape until WF-02+ attaches them
 * to runtime cycles.
 */
export const deserializeWorkflowPackage = (
  data: SerializedWorkflowPackage,
): Package => ({
  metadata: data.metadata,
  cycles: data.cycles.map(toCycleMetadata),
});

// ---------------------------------------------------------------------------
// migrateLegacyForecastToWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Converts legacy forecast save data into a fully populated serialized package.
 */
export const migrateLegacyForecastToSerializedPackage = (
  legacyData: GFCForecastSaveData,
  workflowId: WorkflowId = DEFAULT_WORKFLOW_ID,
): SerializedWorkflowPackage => {
  const cycleDate = legacyData.forecastCycle?.cycleDate ?? new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  const cycleId = makeCycleId(workflowId, cycleDate);
  const status: CycleStatus = 'in-progress';
  const groupingData = buildGroupingData(legacyData);
  const groupings = buildGroupings(legacyData);
  const outlookVersions = buildOutlookVersions(legacyData, now);

  const metadata: WorkflowPackageMetadata = {
    workflowId,
    cycleId,
    version: 1,
    status,
    includesDiscussions: Object.values(groupingData).some((grouping) => grouping.discussion !== undefined),
    includesStyleSnapshots: isFeatureExposed('customProducts')
      && Object.values(groupingData).some((grouping) => Boolean(grouping.customLayers?.layers.length)),
  };

  const serializedCycle: SerializedCycle = {
    id: cycleId,
    workflowId,
    cycleDate,
    status,
    outlookVersions,
    createdAt: now,
    updatedAt: now,
    groupings,
    groupingData,
  };

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    version: '1',
    metadata,
    cycles: [serializedCycle],
  };
};

/**
 * Converts a legacy `GFCForecastSaveData` (v0.5.0 / v1.0.0) into a v2
 * `Package` suitable for import into the workflow system.
 */
export const migrateLegacyForecastToWorkflowPackage = (
  legacyData: GFCForecastSaveData,
  workflowId: WorkflowId = DEFAULT_WORKFLOW_ID,
): Package => deserializeWorkflowPackage(
  migrateLegacyForecastToSerializedPackage(legacyData, workflowId),
);

// ---------------------------------------------------------------------------
// validateWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Type guard that returns `true` when `data` is a valid
 * `SerializedWorkflowPackage`.
 */
export const validateWorkflowPackage = (
  data: unknown,
): data is SerializedWorkflowPackage => {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const candidate = data as Partial<SerializedWorkflowPackage>;

  return (
    typeof candidate.schemaVersion === 'string' &&
    typeof candidate.version === 'string' &&
    isWorkflowPackageMetadata(candidate.metadata) &&
    Array.isArray(candidate.cycles) &&
    candidate.cycles.every(isSerializedCycle)
  );
};
