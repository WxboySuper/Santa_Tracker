import type { StormReport } from '../types/stormReports';
import type { ReportType } from '../types/stormReports';
import { parseTodayCsvRow } from './stormReportRows';

type TodayReportsByType = Record<ReportType, StormReport[]>;

const createReportBuckets = (): TodayReportsByType => ({
  tornado: [],
  wind: [],
  hail: [],
});

const getTodaySectionType = (line: string): ReportType | undefined => {
  if (line.startsWith('Time,F_Scale')) return 'tornado';
  if (line.startsWith('Time,Speed')) return 'wind';
  if (line.startsWith('Time,Size')) return 'hail';
  return undefined;
};

const appendReport = (
  reportsByType: TodayReportsByType,
  type: ReportType,
  report: StormReport,
): void => {
  reportsByType[type].push(report);
};

const flattenReports = (reportsByType: TodayReportsByType): StormReport[] => [
  ...reportsByType.tornado,
  ...reportsByType.wind,
  ...reportsByType.hail,
];

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean);
  const reportsByType = createReportBuckets();
  let activeType: ReportType | undefined;

  for (const line of lines) {
    const sectionType = getTodaySectionType(line);
    if (sectionType) {
      activeType = sectionType;
      continue;
    }

    if (!activeType) {
      continue;
    }

    const report = parseTodayCsvRow(line, activeType);
    if (report) {
      appendReport(reportsByType, activeType, report);
    }
  }

  return flattenReports(reportsByType);
};
