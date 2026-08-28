import JSZip from 'jszip';
import {
  deserializeForecast,
  exportForecastToJson,
  downloadGfcPackage,
  readForecastImportFile,
  validateForecastDataReason,
} from '../fileUtils';
import { downloadKmzExport } from '../kmzExport';
import type { KmzExportStrategy } from '../kmzExport';
import type { ForecastCycle, DayType } from '../../types/outlooks';
import type { CycleMetadata } from '../../types/workflow';
import type { WorkflowExportScope } from '../workflowPackage';
import { detectForecastTransferFormat } from './detectFormat';
import { parseKmlDocument } from './parseKml';
import { forecastCycleFromKmlPlacemarks } from './forecastCycleFromKml';
import type {
  ForecastExportRequest,
  ForecastImportResult,
  ForecastTransferMapView,
  KmlArchiveStrategy,
} from './types';
import { isWorkflowExportPackage } from '../workflowPackage';
import { MAX_IMPORT_BYTES, MAX_KML_IMPORT_BYTES, validateImportFileBytes } from '../forecastImportValidation';

const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const buildFilename = (
  forecastCycle: ForecastCycle,
  scope: ForecastExportRequest['scope'],
  day: DayType | undefined,
  extension: string,
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const scopeLabel = scope === 'current-day'
    ? `day-${day ?? forecastCycle.currentDay}`
    : scope;
  return `gfc-${scopeLabel}-${timestamp}.${extension}`;
};

const toKmzStrategy = (strategy: KmlArchiveStrategy | undefined): KmzExportStrategy =>
  strategy === 'split' ? 'split-kmz' : 'structured-kml';

const toWorkflowScope = (scope: ForecastExportRequest['scope']): WorkflowExportScope =>
  scope === 'workflow' ? 'workflow' : 'cycle';

const toKmlScope = (scope: ForecastExportRequest['scope']): 'current-day' | 'cycle' =>
  scope === 'current-day' ? 'current-day' : 'cycle';

const readFileBytes = async (file: File): Promise<Uint8Array | undefined> => {
  if (typeof file.arrayBuffer !== 'function') return undefined;
  return new Uint8Array(await file.arrayBuffer());
};

const findKmlEntry = (zip: JSZip): JSZip.JSZipObject => {
  const preferred = zip.file('doc.kml')
    ?? Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.kml'));
  if (!preferred) {
    throw new Error('KMZ archive does not contain a KML document.');
  }
  return preferred;
};

const expandKmlEntry = async (entry: JSZip.JSZipObject): Promise<string> => {
  const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (declaredSize !== undefined && declaredSize > MAX_KML_IMPORT_BYTES) {
    throw new Error(`Expanded KML is too large. The maximum supported size is ${MAX_KML_IMPORT_BYTES / 1024 / 1024} MB.`);
  }

  const expandedKml = await entry.async('uint8array');
  if (expandedKml.byteLength > MAX_KML_IMPORT_BYTES) {
    throw new Error(`Expanded KML is too large. The maximum supported size is ${MAX_KML_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
  return new TextDecoder().decode(expandedKml);
};

const readKmzPayload = async (file: File, bytes?: Uint8Array): Promise<string> => {
  const zip = await JSZip.loadAsync(bytes ?? file);
  return expandKmlEntry(findKmlEntry(zip));
};

const readKmlPayload = async (file: File, bytes?: Uint8Array): Promise<string> => {
  if (file.name.toLowerCase().endsWith('.kmz') || file.type === 'application/vnd.google-earth.kmz') {
    return readKmzPayload(file, bytes);
  }
  if (bytes) {
    return new TextDecoder().decode(bytes);
  }

  if (typeof file.text === 'function') {
    return file.text();
  }

  if (typeof file.arrayBuffer === 'function') {
    return new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  }

  throw new Error('Unable to read KML file contents.');
};

const importKmlTransfer = async (
  file: File,
  bytes: Uint8Array | undefined,
  format: 'kml' | 'kmz',
  options?: { baseCycle?: ForecastCycle; defaultDay?: DayType },
): Promise<ForecastImportResult> => {
  const kml = await readKmlPayload(file, bytes);
  const { placemarks, warnings } = parseKmlDocument(kml, options?.defaultDay ?? options?.baseCycle?.currentDay ?? 1);
  return {
    forecastCycle: forecastCycleFromKmlPlacemarks(placemarks, options?.baseCycle),
    warnings,
    format,
  };
};

const importNativeTransfer = async (
  file: File,
  format: 'json' | 'package',
): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const validationError = validateForecastDataReason(data);
  if (validationError) {
    throw new Error(validationError);
  }

  const rawData = data as {
    mapView?: ForecastTransferMapView;
    cycleMetadata?: CycleMetadata | null;
    metadata?: CycleMetadata;
  };

  return {
    forecastCycle: deserializeForecast(data),
    mapView: rawData.mapView,
    cycleMetadata: isWorkflowExportPackage(data) ? rawData.metadata : rawData.cycleMetadata,
    warnings: [],
    format,
  };
};

const prepareImport = async (file: File): Promise<{ bytes: Uint8Array | undefined; format: ForecastImportResult['format'] }> => {
  const bytes = await readFileBytes(file);
  const byteGate = validateImportFileBytes(bytes);
  if (!byteGate.ok) {
    throw new Error(byteGate.reason);
  }

  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const format = detectForecastTransferFormat(file, bytes);
  if (!format) {
    throw new Error('Unsupported file type. Use JSON, ZIP package, KML, or KMZ.');
  }
  return { bytes, format };
};

/** Exports a forecast using the requested transfer format and scope. */
export const exportForecastTransfer = async (request: ForecastExportRequest): Promise<void> => {
  const {
    format,
    scope,
    forecastCycle,
    mapView,
    cycleMetadata,
    day,
    kmlStrategy,
    outlookTypes,
  } = request;

  if (format === 'json') {
    exportForecastToJson(forecastCycle, mapView, cycleMetadata);
    return;
  }

  if (format === 'package') {
    await downloadGfcPackage(forecastCycle, mapView, cycleMetadata, toWorkflowScope(scope));
    return;
  }

  const kmlScope = toKmlScope(scope);
  const kmlOptions = {
    scope: kmlScope,
    day: kmlScope === 'current-day' ? (day ?? forecastCycle.currentDay) : undefined,
    strategy: toKmzStrategy(kmlStrategy),
    outlookTypes,
  };

  if (format === 'kml') {
    const { buildStructuredKmlDocument } = await import('../kmzExport/buildKml');
    const kml = buildStructuredKmlDocument({ forecastCycle, options: kmlOptions });
    triggerBlobDownload(
      new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
      buildFilename(forecastCycle, scope, day, 'kml'),
    );
    return;
  }

  await downloadKmzExport(forecastCycle, kmlOptions, kmlOptions.strategy);
};

/** Imports a forecast file and adapts supported formats to the GFC schema. */
export const importForecastTransfer = async (
  file: File,
  options?: { baseCycle?: ForecastCycle; defaultDay?: DayType },
): Promise<ForecastImportResult> => {
  const { bytes, format } = await prepareImport(file);

  if (format === 'kml' || format === 'kmz') {
    return importKmlTransfer(file, bytes, format, options);
  }

  return importNativeTransfer(file, format);
};

export { detectForecastTransferFormat } from './detectFormat';
export type {
  ForecastExportRequest,
  ForecastImportResult,
  ForecastTransferFormat,
  ForecastTransferScope,
  ForecastTransferMapView,
  KmlArchiveStrategy,
} from './types';
