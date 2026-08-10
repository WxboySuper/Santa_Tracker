import type { ReportType } from '../types/stormReports';

/** Shared storm-report palette used by every map and legend surface. */
export const STORM_REPORT_COLORS: Record<ReportType, string> = {
  tornado: '#FF0000',
  wind: '#0000FF',
  hail: '#00FF00',
};

export const STORM_REPORT_FALLBACK_COLOR = '#888888';
