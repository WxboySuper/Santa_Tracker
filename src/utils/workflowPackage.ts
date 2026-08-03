import type { DayType, GFCForecastSaveData } from '../types/outlooks';
import type { CycleMetadata, SerializedWorkflowPackage } from '../types/workflow';
import { WORKFLOW_SCHEMA_VERSION } from '../types/workflow';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { isFeatureExposed } from '../config/featureExposure';

export type WorkflowExportScope = 'workflow' | 'cycle';

export interface WorkflowExportPackage {
  packageType: WorkflowExportScope;
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  exportedAt: string;
  metadata?: CycleMetadata;
  forecast: GFCForecastSaveData;
  cycleMetadata?: CycleMetadata;
  mapView?: GFCForecastSaveData['mapView'];
  styleSnapshots?: Record<string, unknown>;
  /** Explicit compatibility disclosure for embedded custom content. */
  customContent?: {
    included: true;
    severeAnalytics: 'excluded';
    autoCategorical: 'excluded';
  };
}

const WORKFLOW_GROUPING_DAYS: Record<string, DayType[]> = {
  day1: [1],
  day2: [2],
  day3: [3],
  'day4-8': [4, 5, 6, 7, 8],
};

/** Maps one forecast day to the workflow grouping that owns its custom layers. */
const groupingForDay = (day: DayType): import('../types/workflow').Grouping =>
  day <= 3 ? `day${day}` as import('../types/workflow').Grouping : 'day4-8';

/** Returns true when a package contains any detached custom layer definitions. */
const hasCustomContent = (forecast: GFCForecastSaveData): boolean =>
  Object.values(forecast.forecastCycle?.days ?? {}).some((day) => Boolean(day?.customLayers?.layers.length));

/** Returns the day slots owned by a workflow template. */
const getWorkflowDays = (workflowId: string): Set<DayType> => {
  const template = getWorkflowTemplateById(workflowId);
  if (!template) throw new Error(`Unknown workflow template: ${workflowId}`);
  return new Set(template.groupings.flatMap((grouping) => WORKFLOW_GROUPING_DAYS[grouping] ?? []));
};

/** Removes cycle-wide completion and discussion metadata that refers to excluded days. */
const restrictCycleMetadataToDays = (cycle: NonNullable<GFCForecastSaveData['forecastCycle']>, allowedDays: Set<DayType>) => ({
  ...cycle,
  discussionGroupings: cycle.discussionGroupings
    ?.map((grouping) => ({
      ...grouping,
      days: grouping.days.filter((day) => allowedDays.has(day)),
      discussionDay: allowedDays.has(grouping.discussionDay)
        ? grouping.discussionDay
        : grouping.days.find((day) => allowedDays.has(day)),
    }))
    .filter((grouping): grouping is typeof grouping & { discussionDay: DayType } =>
      grouping.days.length > 0 && grouping.discussionDay !== undefined),
  omittedDayReasons: cycle.omittedDayReasons
    ? Object.fromEntries(Object.entries(cycle.omittedDayReasons).filter(([day]) => allowedDays.has(Number(day) as DayType)))
    : undefined,
});

/** Keeps a workflow-scoped export limited to the days owned by its workflow template. */
export const restrictForecastToWorkflow = (
  forecast: GFCForecastSaveData,
  cycleMetadata?: CycleMetadata,
): GFCForecastSaveData => {
  if (!forecast.forecastCycle) return forecast;
  if (!cycleMetadata?.workflowId) throw new Error('Workflow export requires workflow metadata');
  const allowedDays = getWorkflowDays(cycleMetadata.workflowId);
  if (allowedDays.size === 0 || allowedDays.size === 8) return forecast;
  const days = Object.fromEntries(
    Object.entries(forecast.forecastCycle.days).filter(([day]) => allowedDays.has(Number(day) as DayType)),
  );
  return {
    ...forecast,
    forecastCycle: {
      ...restrictCycleMetadataToDays(forecast.forecastCycle, allowedDays),
      days,
      currentDay: allowedDays.has(forecast.forecastCycle.currentDay)
        ? forecast.forecastCycle.currentDay
        : (Array.from(allowedDays)[0] ?? forecast.forecastCycle.currentDay),
    },
  };
};

/** Builds the JSON payload used by both workflow- and cycle-scoped exports. */
export const buildWorkflowExportPackage = ({
  scope,
  forecast,
  cycleMetadata,
  styleSnapshots,
  exportedAt = new Date().toISOString(),
}: {
  scope: WorkflowExportScope;
  forecast: GFCForecastSaveData;
  cycleMetadata?: CycleMetadata;
  styleSnapshots?: Record<string, unknown>;
  exportedAt?: string;
}): WorkflowExportPackage => {
  const scopedForecast = scope === 'workflow' ? restrictForecastToWorkflow(forecast, cycleMetadata) : forecast;
  return {
    packageType: scope,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    exportedAt,
    ...(cycleMetadata ? { metadata: cycleMetadata } : {}),
    ...(cycleMetadata ? { cycleMetadata } : {}),
    ...(forecast.mapView ? { mapView: forecast.mapView } : {}),
    forecast: scopedForecast,
    ...(styleSnapshots ? { styleSnapshots } : {}),
    ...(isFeatureExposed('customProducts') && hasCustomContent(scopedForecast) ? {
      customContent: {
        included: true,
        severeAnalytics: 'excluded',
        autoCategorical: 'excluded',
      },
    } : {}),
  };
};

/** Returns true only for the exact top-level markers of a workflow export package. */
export const isWorkflowExportPackage = (value: unknown): value is WorkflowExportPackage => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkflowExportPackage>;
  return (candidate.packageType === 'workflow' || candidate.packageType === 'cycle')
    && candidate.schemaVersion === WORKFLOW_SCHEMA_VERSION
    && typeof candidate.exportedAt === 'string'
    && Boolean(candidate.forecast && typeof candidate.forecast === 'object');
};

/** Converts the local package into the v2 package shape used for future readers. */
export const toSerializedWorkflowPackage = (pkg: WorkflowExportPackage): SerializedWorkflowPackage | null => {
  const metadata = pkg.metadata;
  if (!metadata) return null;
  const version = metadata.outlookVersions.at(-1)?.version ?? 1;
  const dayEntries = Object.entries(pkg.forecast.forecastCycle?.days ?? {});
  const groupingData = Object.fromEntries(dayEntries.map(([day, value]) => {
    const dayNumber = Number(day) as DayType;
    const groupingValue = isFeatureExposed('customProducts')
      ? value
      : { ...value, customLayers: undefined };
    return [`${groupingForDay(dayNumber)}-day${dayNumber}-v${version}`, groupingValue];
  }));
  return {
    schemaVersion: pkg.schemaVersion,
    version: pkg.schemaVersion,
    metadata: {
      workflowId: metadata.workflowId,
      cycleId: metadata.id,
      version,
      status: metadata.status,
      includesDiscussions: Object.values(groupingData).some((day) => Boolean((day as { discussion?: unknown }).discussion)),
      includesStyleSnapshots: Boolean(pkg.styleSnapshots || pkg.customContent?.included),
    },
    cycles: [{
      id: metadata.id,
      workflowId: metadata.workflowId,
      cycleDate: metadata.cycleDate,
      status: metadata.status,
      outlookVersions: metadata.outlookVersions,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      groupings: dayEntries.map(([day]) => {
        const dayNumber = Number(day) as DayType;
        return { grouping: groupingForDay(dayNumber), day: dayNumber };
      }),
      groupingData,
    }],
    ...(pkg.styleSnapshots ? { styleSnapshots: pkg.styleSnapshots } : {}),
  };
};
