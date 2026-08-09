import type { StormReport } from '../types/stormReports';
import type { ReportType } from '../types/stormReports';
import { parseTodayCsvRow } from './stormReportRows';

const TODAY_SECTION_HEADERS: ReadonlyArray<{ header: string; type: ReportType }> = [
  { header: 'Time,F_Scale', type: 'tornado' },
  { header: 'Time,Speed', type: 'wind' },
  { header: 'Time,Size', type: 'hail' },
];

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean);
  const reportsByType: Record<ReportType, StormReport[]> = {
    tornado: [],
    wind: [],
    hail: [],
  };
  let activeType: ReportType | undefined;

  for (const line of lines) {
    if (line.startsWith('Time,')) {
      activeType = TODAY_SECTION_HEADERS.find(({ header }) => line.startsWith(header))?.type;
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

  return TODAY_SECTION_HEADERS.flatMap(({ type }) => reportsByType[type]);
};
