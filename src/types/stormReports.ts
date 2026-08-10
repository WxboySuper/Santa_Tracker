/**
 * Storm report types for NOAA storm report data
 */

export type ReportType = 'tornado' | 'wind' | 'hail';
export type StormReportSource = 'SPC' | 'DAT';

export interface StormReport {
  id: string;
  type: ReportType;
  latitude: number;
  longitude: number;
  time: string;
  magnitude?: string; // F-scale for tornadoes, mph for wind, inches for hail
  location: string;
  county: string;
  state: string;
  comments?: string;
  source?: StormReportSource;
}

export interface StormReportsState {
  reports: StormReport[];
  date: string | null;
  loading: boolean;
  error: string | null;
  visible: boolean;
  filterByType: {
    tornado: boolean;
    wind: boolean;
    hail: boolean;
  };
}
