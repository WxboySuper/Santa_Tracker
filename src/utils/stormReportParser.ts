import { StormReport, ReportType } from '../types/stormReports';
import { parseArchiveCsvRow } from './stormReportRows';
import { parseTodayStormReportCsv } from './stormReportTodayCsv';

export { parseTodayStormReportCsv } from './stormReportTodayCsv';

export const SPC_TODAY_STORM_REPORTS_URL = 'https://www.spc.noaa.gov/climo/reports/today.csv';

export const SPC_YESTERDAY_STORM_REPORTS_URL = 'https://www.spc.noaa.gov/climo/reports/yesterday.csv';

const archiveUrlForDate = (date: string): string =>
  `https://www.spc.noaa.gov/climo/reports/${date}_rpts_raw.csv`;

/**
 * Parses archived *_rpts_raw.csv storm report text.
 */
export const parseArchiveStormReportCsv = (csvText: string): StormReport[] => {
  const reports: StormReport[] = [];
  const lines = csvText.split('\n');

  let currentSection: ReportType | null = null;
  let headers: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.includes('Raw Tornado LSR')) {
      currentSection = 'tornado';
      continue;
    }
    if (line.includes('Raw Wind/Gust LSR') || line.includes('Raw Wind LSR')) {
      currentSection = 'wind';
      continue;
    }
    if (line.includes('Raw Hail LSR')) {
      currentSection = 'hail';
      continue;
    }

    if (line.startsWith('Time,')) {
      headers = line.split(',');
      continue;
    }

    if (!currentSection || headers.length === 0) {
      continue;
    }

    try {
      const report = parseArchiveCsvRow(line, currentSection, headers);
      if (report) {
        reports.push(report);
      }
    } catch {
      continue;
    }
  }

  return reports;
};

/**
 * Fetches storm reports from NOAA archives for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const response = await fetch(archiveUrlForDate(date));

  if (!response.ok) {
    throw new Error(`Failed to fetch storm reports: ${response.statusText}`);
  }

  return parseArchiveStormReportCsv(await response.text());
}

/** Fetches same-day SPC storm reports (today.csv). */
export async function fetchTodayStormReports(): Promise<StormReport[]> {
  const response = await fetch(SPC_TODAY_STORM_REPORTS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch today's storm reports: ${response.statusText}`);
  }

  return parseTodayStormReportCsv(await response.text());
}

/** Fetches the previous report day's SPC storm reports (yesterday.csv). */
export async function fetchYesterdayStormReports(): Promise<StormReport[]> {
  const response = await fetch(SPC_YESTERDAY_STORM_REPORTS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch yesterday's storm reports: ${response.statusText}`);
  }

  return parseTodayStormReportCsv(await response.text());
}

/**
 * Formats a date object to YYMMDD format for NOAA storm report archives
 */
export function formatReportDate(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Parses YYMMDD format to Date object
 */
export function parseReportDate(dateStr: string): Date {
  const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10) - 1;
  const day = parseInt(dateStr.slice(4, 6), 10);
  return new Date(year, month, day);
}
