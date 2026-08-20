import type { StormReport, ReportType } from '../types/stormReports';
import { parseTodayCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';

type TodayReportsByType = Record<ReportType, StormReport[]>;

const createReportBuckets = (): TodayReportsByType => ({
  tornado: [],
  wind: [],
  hail: [],
});

const getTodaySectionType = (line: string): ReportType | undefined => {
  return TODAY_SECTION_HEADERS.find(({ header }) => line.startsWith(header))?.type;
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
    if (line.startsWith('Time,')) {
      // Preserve the former parser's boundary behavior for unknown sections.
      activeType = sectionType;
      continue;
    }

    if (!activeType) {
      continue;
    }

    const report = parseTodayCsvRow(line, activeType);
    if (report) {
      reportsByType[activeType].push(report);
    }
  }

  return flattenReports(reportsByType);
};
