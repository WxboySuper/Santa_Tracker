import type { ReportType, StormReport } from '../types/stormReports';
import { splitCsvLine } from '../utils/stormReportCsv';
import { parseTodayCsvRow } from '../utils/stormReportRows';
import { parseTodayStormReportCsv } from '../utils/stormReportParser';
import { measure, reportComparison } from './benchmarkUtils';

const TODAY_SECTION_HEADERS: ReadonlyArray<{ header: string; type: ReportType }> = [
  { header: 'Time,F_Scale', type: 'tornado' },
  { header: 'Time,Speed', type: 'wind' },
  { header: 'Time,Size', type: 'hail' },
];

const splitCsvLineLegacy = (line: string): string[] => {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  values.push(currentValue);
  return values;
};

const parseTodaySectionRowsLegacy = (
  lines: string[],
  startIndex: number,
  type: ReportType,
): StormReport[] => {
  const reports: StormReport[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith('Time,')) {
      break;
    }

    const report = parseTodayCsvRow(line, type);
    if (report) {
      reports.push(report);
    }
  }

  return reports;
};

/** Reproduces the former section-by-section scan of today.csv. */
const parseTodayStormReportCsvLegacy = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean);

  return TODAY_SECTION_HEADERS.flatMap(({ header, type }) => {
    const headerIndex = lines.findIndex((line) => line.startsWith(header));
    if (headerIndex < 0) {
      return [];
    }

    return parseTodaySectionRowsLegacy(lines, headerIndex + 1, type);
  });
};

const createTodayCsv = (rowsPerSection = 100): string => {
  const sections = TODAY_SECTION_HEADERS.map(({ header, type }) => {
    const rows = Array.from({ length: rowsPerSection }, (_, index) => {
      const values = type === 'tornado'
        ? [index.toString().padStart(4, '0'), '1', 'Ada', 'OK', 'OK', '34.77', '-96.67', `Tornado ${index}`]
        : type === 'wind'
          ? [index.toString().padStart(4, '0'), '65', 'Norman', 'OK', 'OK', '35.22', '-97.44', `Wind ${index}`]
          : [index.toString().padStart(4, '0'), '1.75', 'Moore', 'OK', 'OK', '35.34', '-97.49', `Hail ${index}`];
      return values.join(',');
    });
    return [header, ...rows].join('\n');
  });

  return sections.join('\n');
};

const withoutIds = (reports: StormReport[]) => reports.map(({ id: _id, ...report }) => report);

describe('storm report parser performance', () => {
  test('compares optimized CSV character accumulation and today.csv traversal', () => {
    if (process.env.GFC_PERF !== '1') return;

    const splitFixtures = [
      { label: '80-char quoted field', line: `"${'weather '.repeat(10)}",ok,65`, iterations: 1000 },
      { label: '8,000-char quoted field', line: `"${'weather '.repeat(1000)}",ok,65`, iterations: 500 },
      { label: '100,000-char quoted field', line: `"${'weather '.repeat(12500)}",ok,65`, iterations: 100 },
    ];
    splitFixtures.forEach(({ line }) => {
      expect(splitCsvLine(line)).toEqual(splitCsvLineLegacy(line));
    });

    const todayCsv = createTodayCsv();
    const optimizedReports = parseTodayStormReportCsv(todayCsv);
    const baselineReports = parseTodayStormReportCsvLegacy(todayCsv);
    expect(withoutIds(optimizedReports)).toEqual(withoutIds(baselineReports));

    splitFixtures.forEach(({ label, line, iterations }) => {
      const splitBaseline = measure(() => {
        splitCsvLineLegacy(line);
      }, { iterations, samples: 5, warmup: 2 });
      const splitOptimized = measure(() => {
        splitCsvLine(line);
      }, { iterations, samples: 5, warmup: 2 });
      reportComparison(`storm CSV split (${label})`, splitBaseline, splitOptimized);
    });

    [
      { label: '300 reports', csv: todayCsv, iterations: 50 },
      { label: '3,000 reports', csv: createTodayCsv(1000), iterations: 10 },
    ].forEach(({ label, csv, iterations }) => {
      const parserBaseline = measure(() => {
        parseTodayStormReportCsvLegacy(csv);
      }, { iterations, samples: 5, warmup: 2 });
      const parserOptimized = measure(() => {
        parseTodayStormReportCsv(csv);
      }, { iterations, samples: 5, warmup: 2 });
      reportComparison(`today.csv parser (${label})`, parserBaseline, parserOptimized);
    });
  });
});
