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
  const tornadoReports: StormReport[] = [];
  const windReports: StormReport[] = [];
  const hailReports: StormReport[] = [];
  let activeType: ReportType | undefined;

  for (const line of lines) {
    if (line.startsWith('Time,F_Scale')) {
      activeType = 'tornado';
      continue;
    }
    if (line.startsWith('Time,Speed')) {
      activeType = 'wind';
      continue;
    }
    if (line.startsWith('Time,Size')) {
      activeType = 'hail';
      continue;
    }

    if (!activeType) {
      continue;
    }

    const report = parseTodayCsvRow(line, activeType);
    if (report) {
      if (activeType === 'tornado') {
        tornadoReports.push(report);
      } else if (activeType === 'wind') {
        windReports.push(report);
      } else {
        hailReports.push(report);
      }
    }
  }

  return [...tornadoReports, ...windReports, ...hailReports];
};
