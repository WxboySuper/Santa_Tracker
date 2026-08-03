import JSZip from 'jszip';
import { OutlookData, GFCForecastSaveData, ForecastCycle, DayType, OutlookDay, DiscussionData, SerializedOutlookData, OutlookType, CycleMetadata } from '../types/outlooks';
import { compileDiscussionToText } from './discussionUtils';
import {
  getDiscussionForGrouping,
  getDiscussionGroupings,
  getDiscussionOwnerDay,
  hasDiscussionContent,
  isValidDiscussionGroupings,
  normalizeDiscussionGroupings,
} from './discussionGrouping';
import { coerceOutlookProbabilityMap } from './outlookMapCoercion';
import { completionMetadataFromForecastCycle } from './forecastCompletionMetadata';
import { deserializeForecastCycleDays } from './forecastCycleDeserialize';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { buildWorkflowExportPackage, isWorkflowExportPackage, type WorkflowExportScope } from './workflowPackage';
import { isFeatureExposed } from '../config/featureExposure';

const CURRENT_VERSION = '1.0.0';

/** Reads bytes when the browser File implementation exposes arrayBuffer. */
const readFileBytes = async (file: File): Promise<Uint8Array | undefined> => {
  if (typeof file.arrayBuffer !== 'function') return undefined;
  return new Uint8Array(await file.arrayBuffer());
};

/** Detects ZIP packages from browser metadata or their standard magic bytes. */
const isZipImport = (file: File, bytes?: Uint8Array): boolean => [
  file.name.toLowerCase().endsWith('.zip'),
  file.type === 'application/zip',
  bytes?.[0] === 0x50 && bytes?.[1] === 0x4b,
].includes(true);

/** Extracts the preferred forecast payload from a workflow ZIP package. */
const readForecastPackage = async (file: File, bytes?: Uint8Array): Promise<unknown> => {
  const zip = await JSZip.loadAsync(bytes ?? file);
  const entry = zip.file('workflow_package.json') ?? zip.file('forecast_cycle.json');
  if (!entry) throw new Error('Package is missing workflow_package.json and forecast_cycle.json.');
  return JSON.parse(await entry.async('string')) as unknown;
};

/** Parses a plain JSON forecast from already-read bytes or the File text API. */
const readForecastJson = async (file: File, bytes?: Uint8Array): Promise<unknown> => {
  const text = bytes ? new TextDecoder().decode(bytes) : await file.text();
  return JSON.parse(text) as unknown;
};

/** Reads either a plain forecast JSON file or a GFC workflow ZIP package. */
export const readForecastImportFile = async (file: File): Promise<unknown> => {
  const bytes = await readFileBytes(file);
  if (isFeatureExposed('customProducts') && isZipImport(file, bytes)) return readForecastPackage(file, bytes);
  return readForecastJson(file, bytes);
};

/** Converts a Map into JSON-friendly entry tuples. */
const mapToArray = <K, V>(m: Map<K, V>): [K, V][] =>
  m instanceof Map ? Array.from(m.entries()) : [];

/** Restores an outlook probability map from its supported serialized forms. */
const deserializeOutlookMap = <K extends string, V>(
  value: [K, V][] | Record<string, V> | Map<K, V> | undefined,
): Map<K, V> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const coerced = coerceOutlookProbabilityMap(value);
  return (coerced as Map<K, V> | null) ?? new Map<K, V>();
};

/** Creates a safe, deterministic, collision-free discussion filename for a ZIP archive. */
export const createUniqueDiscussionEntryName = (
  identifier: string,
  usedNames: Set<string>,
): string => {
  const safeIdentifier = identifier
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '')
    || 'discussion';
  const baseName = `discussion_${safeIdentifier}`;
  let name = `${baseName}.txt`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${baseName}-${suffix}.txt`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

// Types for serialization helper
type SerializedDay = {
  day: DayType;
  metadata: {
    issueDate: string;
    validDate: string;
    issuanceTime: string;
    lowProbabilityOutlooks?: OutlookType[];
    createdAt?: string;
    lastModified?: string;
  };
  data: SerializedOutlookData;
  customLayers?: OutlookDay['customLayers'];
  discussion?: DiscussionData;
};

// Helper to create empty outlook based on day type
/** Converts one outlook day into its JSON-compatible representation. */
const serializeOutlookDay = (outlookDay: OutlookDay): SerializedDay => {
  const serializedData: SerializedOutlookData = {};
  const mapFields: (keyof OutlookData)[] = ['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical'];
  mapFields.forEach((field) => {
    const map = outlookDay.data[field];
    if (map) serializedData[field] = mapToArray(map);
  });
  return {
    day: outlookDay.day,
    metadata: { ...outlookDay.metadata, lowProbabilityOutlooks: outlookDay.metadata.lowProbabilityOutlooks || [] },
    data: serializedData,
    ...(outlookDay.customLayers ? { customLayers: JSON.parse(JSON.stringify(outlookDay.customLayers)) as OutlookDay['customLayers'] } : {}),
    discussion: outlookDay.discussion,
  };
};

/** Creates empty Map-backed outlook fields appropriate for a forecast day. */
const createBaseOutlookData = (day: DayType): OutlookData => {
  if (day === 1 || day === 2) return { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
  if (day === 3) return { totalSevere: new Map(), categorical: new Map() };
  return { 'day4-8': new Map() };
};

/** Creates a new empty outlook day with current metadata timestamps. */
const createEmptyOutlook = (day: DayType): OutlookDay => {
  const baseData = createBaseOutlookData(day);
  return {
    day,
    data: baseData,
    metadata: {
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: []
    }
  };
};

/**
 * Serializes the current ForecastCycle into a JSON-compatible format.
 * When `cycleMetadata` is provided, the output is tagged with v2 workflow metadata.
 */
export const serializeForecast = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata
): GFCForecastSaveData => {
  const serializedDays: Partial<Record<DayType, SerializedDay>> = {};
  
  (Object.keys(forecastCycle.days) as unknown as DayType[]).forEach((day) => {
    const outlookDay = forecastCycle.days[day];
    if (outlookDay) serializedDays[day] = serializeOutlookDay(outlookDay);
  });

  const result: GFCForecastSaveData = {
    version: CURRENT_VERSION,
    type: 'forecast-cycle',
    timestamp: new Date().toISOString(),
    forecastCycle: {
      days: serializedDays,
      currentDay: forecastCycle.currentDay,
      cycleDate: forecastCycle.cycleDate,
      ...(isValidDiscussionGroupings(forecastCycle.discussionGroupings)
        ? { discussionGroupings: normalizeDiscussionGroupings(forecastCycle.discussionGroupings) }
        : {}),
      ...completionMetadataFromForecastCycle(forecastCycle),
    },
    mapView,
    ...(cycleMetadata ? { cycleMetadata } : {}),
  };

  return result;
};

/** Migrates the legacy single-outlook save format into a day-one forecast cycle. */
const deserializeLegacyForecast = (data: GFCForecastSaveData): ForecastCycle => {
  const day1 = createEmptyOutlook(1);
  const outlooks = data.outlooks;
  if (outlooks) {
    day1.data = Object.fromEntries(
      (['tornado', 'wind', 'hail', 'categorical'] as const)
        .filter((field) => outlooks[field])
        .map((field) => [field, deserializeOutlookMap(outlooks[field])]),
    ) as OutlookData;
  }
  return { days: { 1: day1 }, currentDay: 1, cycleDate: new Date().toISOString().split('T')[0] };
};

/**
 * Deserializes the saved JSON data back into ForecastCycle.
 * Handles migration from single-day format and v1.0.0 cycleMetadata embedding.
 */
export const deserializeForecast = (data: GFCForecastSaveData | unknown): ForecastCycle => {
  if (isWorkflowExportPackage(data)) return deserializeForecast(data.forecast);
  if (!data || typeof data !== 'object') return deserializeLegacyForecast({} as GFCForecastSaveData);
  const forecastData = data as GFCForecastSaveData;
  if (!forecastData.forecastCycle) return deserializeLegacyForecast(forecastData);
  const cycle = forecastData.forecastCycle;
  return {
    days: deserializeForecastCycleDays(cycle),
    currentDay: cycle.currentDay,
    cycleDate: cycle.cycleDate,
    ...(isValidDiscussionGroupings(cycle.discussionGroupings)
      ? { discussionGroupings: normalizeDiscussionGroupings(cycle.discussionGroupings) }
      : {}),
    ...completionMetadataFromForecastCycle(cycle),
  };
};

/** Creates a deep forecast-cycle clone while preserving Map-backed outlook data. */
export const cloneForecastCycle = (forecastCycle: ForecastCycle): ForecastCycle =>
  deserializeForecast(
    serializeForecast(forecastCycle, {
      center: [0, 0],
      zoom: 0,
    })
  );

/**
 * Validates that the input data conforms to the GFCForecastSaveData schema.
 */
export const validateForecastData = (data: unknown): data is GFCForecastSaveData => {
  if (isWorkflowExportPackage(data)) return validateForecastData(data.forecast);
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Partial<GFCForecastSaveData>;

  // Check valid structure (either new or old)
  return Boolean(candidate.forecastCycle || candidate.outlooks);
};

/**
 * Triggers a download of the serialized forecast data as a JSON file.
 * When `cycleMetadata` is provided, the export keeps the active workflow
 * metadata so a re-import can restore the workflow session.
 */
export const exportForecastToJson = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata
) => {
  const data = serializeForecast(forecastCycle, mapView, cycleMetadata);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-forecast-${timestamp}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Adds a non-empty discussion to the package using a collision-free entry name. */
interface DiscussionZipEntry {
  discussion: DiscussionData | undefined;
  day: DayType;
  identifier: string;
}

/** Adds a non-empty discussion to a ZIP and records its exported day. */
const addDiscussionToZip = (
  zip: JSZip,
  usedEntryNames: Set<string>,
  exportedDays: Set<DayType>,
  entry: DiscussionZipEntry,
): void => {
  const { discussion, day, identifier } = entry;
  if (!discussion || !hasDiscussionContent(discussion)) return;
  zip.file(createUniqueDiscussionEntryName(identifier, usedEntryNames), compileDiscussionToText(discussion, day));
  exportedDays.add(day);
};

/** Adds only discussions belonging to the forecast scope represented by the package. */
const addPackageDiscussions = (
  zip: JSZip,
  forecast: GFCForecastSaveData,
  cycleMetadata: CycleMetadata | undefined,
): void => {
  const exportedForecastCycle = deserializeForecast(forecast);
  const workflowTemplate = cycleMetadata ? getWorkflowTemplateById(cycleMetadata.workflowId) : undefined;
  const hasStandardWorkflowGrouping = workflowTemplate?.groupings.some((grouping) =>
    grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  const hasValidPersistedGrouping = isValidDiscussionGroupings(exportedForecastCycle.discussionGroupings);
  const exportedDays = new Set<DayType>();
  const usedEntryNames = new Set<string>(['forecast_cycle.json']);

  if (hasValidPersistedGrouping || hasStandardWorkflowGrouping) {
    getDiscussionGroupings(exportedForecastCycle, workflowTemplate).forEach((grouping) => {
      const ownerDay = getDiscussionOwnerDay(exportedForecastCycle, grouping);
      addDiscussionToZip(zip, usedEntryNames, exportedDays, {
        discussion: getDiscussionForGrouping(exportedForecastCycle, grouping),
        day: ownerDay,
        identifier: grouping.id,
      });
    });
  }

  (Object.keys(exportedForecastCycle.days) as unknown as DayType[])
    .sort((a, b) => a - b)
    .forEach((day) => {
      if (!exportedDays.has(day)) {
        addDiscussionToZip(zip, usedEntryNames, exportedDays, {
          discussion: exportedForecastCycle.days[day]?.discussion,
          day,
          identifier: `day${day}`,
        });
      }
    });
};

/** Bundles the forecast JSON and all day discussions into a single .zip package. */
export const downloadGfcPackage = async (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata,
  scope: WorkflowExportScope = 'cycle',
): Promise<void> => {
  const zip = new JSZip();

  // 1. Forecast JSON
  const pkg = buildWorkflowExportPackage({ scope, forecast: serializeForecast(forecastCycle, mapView, cycleMetadata), cycleMetadata });
  const data = pkg.forecast;
  zip.file('forecast_cycle.json', JSON.stringify(data, null, 2));
  zip.file('workflow_package.json', JSON.stringify(pkg, null, 2));
  addPackageDiscussions(zip, data, cycleMetadata);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-${scope}-package-${timestamp}.zip`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
