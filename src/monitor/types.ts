export type MonitorRadarMode = 'none' | 'mrms-conus' | 'site';

export type MonitorRadarProduct = 'bref-qcd' | 'cref-qcd' | 'sr-bref' | 'sr-bvel';

export type MonitorSatelliteProduct = 'none' | 'goes-visible' | 'goes-longwave' | 'goes-water-vapor' | 'goes-shortwave';

export type MonitorOutlookSourceKind = 'current' | 'local-cycle' | 'cloud-cycle';

export const MONITOR_OUTLOOK_LAYER_TYPES = ['tornado', 'wind', 'hail', 'categorical'] as const;

export type MonitorOutlookLayerType = (typeof MONITOR_OUTLOOK_LAYER_TYPES)[number];

export interface MonitorReferenceLayerSettings {
  ndfdTemperatureEnabled: boolean;
  spcMesoscaleDiscussionEnabled: boolean;
}

export interface MonitorOutlookSourceSelection {
  kind: MonitorOutlookSourceKind;
  id: string;
}

export interface MonitorMapView {
  center: [number, number];
  zoom: number;
}

export interface MonitorSettings {
  radarMode: MonitorRadarMode;
  radarProduct: MonitorRadarProduct;
  radarSite: string;
  radarOpacity: number;
  satelliteProduct: MonitorSatelliteProduct;
  satelliteOpacity: number;
  outlookSource: MonitorOutlookSourceSelection;
  outlookType: MonitorOutlookLayerType;
  mapView: MonitorMapView;
  animationEnabled: boolean;
  animationSpeedMs: number;
  stormReportsEnabled: boolean;
  stormReportsFilterTornado: boolean;
  stormReportsFilterWind: boolean;
  stormReportsFilterHail: boolean;
  stormReportsMatchOutlookType: boolean;
  alertsEnabled: boolean;
  alertsOpacity: number;
  alertsShowWatches: boolean;
  alertsShowWarnings: boolean;
  alertsShowAdvisories: boolean;
  referenceLayers: MonitorReferenceLayerSettings;
}

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  radarMode: 'none',
  radarProduct: 'bref-qcd',
  radarSite: 'KTLX',
  radarOpacity: 0.72,
  satelliteProduct: 'none',
  satelliteOpacity: 0.68,
  outlookSource: {
    kind: 'current',
    id: 'current',
  },
  outlookType: 'categorical',
  mapView: {
    center: [39.8283, -98.5795],
    zoom: 4,
  },
  animationEnabled: false,
  animationSpeedMs: 400,
  stormReportsEnabled: true,
  stormReportsFilterTornado: true,
  stormReportsFilterWind: true,
  stormReportsFilterHail: true,
  stormReportsMatchOutlookType: false,
  alertsEnabled: true,
  alertsOpacity: 0.55,
  alertsShowWatches: true,
  alertsShowWarnings: true,
  alertsShowAdvisories: false,
  referenceLayers: {
    ndfdTemperatureEnabled: false,
    spcMesoscaleDiscussionEnabled: false,
  },
};

export const areMonitorSettingsEqual = (left: MonitorSettings, right: MonitorSettings): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
