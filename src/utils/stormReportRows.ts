import { v4 as uuidv4 } from 'uuid';
import type { ReportType, StormReport } from '../types/stormReports';
import { buildCsvRow, extractStormReportMagnitude, splitCsvLine } from './stormReportCsv';
import type { StormReportRowFieldMap } from './stormReportCsv';

export type TodaySectionDescriptor = {
  header: string;
  rowHeaders: readonly string[];
};

export type TodaySectionHeader = {
  header: string;
  type: ReportType;
};

/** Shared today.csv section and row schema used by parsing and benchmarks. */
export const TODAY_SECTION_DESCRIPTORS: Record<ReportType, TodaySectionDescriptor> = {
  tornado: {
    header: 'Time,F_Scale',
    rowHeaders: ['Time', 'F_Scale', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
  wind: {
    header: 'Time,Speed',
    rowHeaders: ['Time', 'Speed', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
  hail: {
    header: 'Time,Size',
    rowHeaders: ['Time', 'Size', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
};

export const TODAY_SECTION_HEADERS: ReadonlyArray<TodaySectionHeader> = (
  Object.keys(TODAY_SECTION_DESCRIPTORS) as ReportType[]
).map((type) => ({
  header: TODAY_SECTION_DESCRIPTORS[type].header,
  type,
}));

const parseStormReportRow = (
  line: string,
  type: ReportType,
  headers: string[],
  fields: StormReportRowFieldMap,
): StormReport | null => {
  const row = buildCsvRow(headers, splitCsvLine(line));
  const lat = parseFloat(row[fields.latField]);
  const lon = parseFloat(row[fields.lonField]);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return {
    id: uuidv4(),
    type,
    latitude: lat,
    longitude: lon,
    time: row.Time ? `${row.Time}Z` : '',
    magnitude: extractStormReportMagnitude(type, row, fields),
    location: row.Location || '',
    county: row.County || '',
    state: row.State || '',
    comments: row[fields.remarksField] || '',
  };
};

export const parseTodayCsvRow = (line: string, type: ReportType): StormReport | null => {
  const { rowHeaders } = TODAY_SECTION_DESCRIPTORS[type];

  return parseStormReportRow(line, type, [...rowHeaders], {
    scaleField: type === 'tornado' ? 'F_Scale' : undefined,
    speedField: type === 'wind' ? 'Speed' : undefined,
    sizeField: type === 'hail' ? 'Size' : undefined,
    latField: 'Lat',
    lonField: 'Lon',
    remarksField: 'Comments',
  });
};

export const parseArchiveCsvRow = (
  line: string,
  type: ReportType,
  headers: string[],
): StormReport | null =>
  parseStormReportRow(line, type, headers, {
    scaleField: 'EF_Scale',
    speedField: 'Speed(MPH)',
    sizeField: 'Size(1/100in.)',
    latField: 'LAT',
    lonField: 'LON',
    remarksField: 'Remarks',
  });
