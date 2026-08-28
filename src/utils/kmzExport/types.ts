import type { DayType, ForecastCycle, OutlookType } from '../../types/outlooks';

/** Which forecast content to include in a KMZ/KML export. */
export type KmzExportScope = 'current-day' | 'cycle';

/**
 * structured-kml: one KML document with nested Day > Outlook > Placemark folders.
 * split-kmz: KMZ archive with one KML file per day/outlook combination.
 */
export type KmzExportStrategy = 'structured-kml' | 'split-kmz';

export interface KmzExportOptions {
  scope: KmzExportScope;
  strategy?: KmzExportStrategy;
  /** Defaults to the forecast cycle's current day when scope is current-day. */
  day?: DayType;
  /** When set, only these outlook layers are exported. */
  outlookTypes?: OutlookType[];
  /** Custom layers are excluded by default because hatch styling is not portable. */
  includeCustomLayers?: boolean;
}

export interface KmzExportFeature {
  day: DayType;
  outlookType: OutlookType;
  probabilityKey: string;
  featureIndex: number;
  feature: GeoJSON.Feature;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  isSignificant: boolean;
  isCig: boolean;
  cigLevel?: string;
}

export interface KmzExportInput {
  forecastCycle: ForecastCycle;
  options: KmzExportOptions;
}
