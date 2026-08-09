import {
  DEFAULT_MONITOR_SETTINGS,
  MONITOR_OUTLOOK_LAYER_TYPES,
  type MonitorMapView,
  type MonitorOutlookLayerType,
  type MonitorOutlookSourceKind,
  type MonitorOutlookSourceSelection,
  type MonitorRadarMode,
  type MonitorRadarProduct,
  type MonitorSatelliteProduct,
  type MonitorSettings,
} from './types';

const RADAR_MODES: MonitorRadarMode[] = ['none', 'mrms-conus', 'site'];
const RADAR_PRODUCTS: MonitorRadarProduct[] = ['bref-qcd', 'cref-qcd', 'sr-bref', 'sr-bvel'];
const SATELLITE_PRODUCTS: MonitorSatelliteProduct[] = ['none', 'goes-visible', 'goes-longwave', 'goes-water-vapor', 'goes-shortwave'];
const OUTLOOK_KINDS: MonitorOutlookSourceKind[] = ['current', 'local-cycle', 'cloud-cycle'];
const OUTLOOK_LAYER_TYPES: readonly MonitorOutlookLayerType[] = MONITOR_OUTLOOK_LAYER_TYPES;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;

const readNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
};

const readSite = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  return /^K[A-Z0-9]{3}$/.test(normalized) ? normalized : fallback;
};

const isLatLonPair = (center: unknown): center is [number, number] =>
  Array.isArray(center) &&
  center.length === 2 &&
  typeof center[0] === 'number' &&
  typeof center[1] === 'number';

const readMapViewCenter = (center: unknown, zoom: unknown): MonitorMapView | null => {
  if (!isLatLonPair(center) || typeof zoom !== 'number') {
    return null;
  }

  return {
    center: [
      readNumber(center[0], DEFAULT_MONITOR_SETTINGS.mapView.center[0], -90, 90),
      readNumber(center[1], DEFAULT_MONITOR_SETTINGS.mapView.center[1], -180, 180),
    ],
    zoom: readNumber(zoom, DEFAULT_MONITOR_SETTINGS.mapView.zoom, 2, 14),
  };
};

const readMapView = (value: unknown): MonitorMapView => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS.mapView;
  }

  return readMapViewCenter(value.center, value.zoom) ?? DEFAULT_MONITOR_SETTINGS.mapView;
};

const readOutlookSource = (value: unknown): MonitorOutlookSourceSelection => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS.outlookSource;
  }

  const kind = readEnum(value.kind, OUTLOOK_KINDS, DEFAULT_MONITOR_SETTINGS.outlookSource.kind);
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : DEFAULT_MONITOR_SETTINGS.outlookSource.id;
  return { kind, id };
};

const readBooleanSetting = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const readReferenceLayers = (value: unknown): MonitorSettings['referenceLayers'] => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS.referenceLayers;
  }

  return {
    spcMesoscaleDiscussionEnabled: readBooleanSetting(
      value.spcMesoscaleDiscussionEnabled,
      DEFAULT_MONITOR_SETTINGS.referenceLayers.spcMesoscaleDiscussionEnabled,
    ),
  };
};

export const normalizeMonitorSettings = (value: unknown): MonitorSettings => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS;
  }

  return {
    radarMode: readEnum(value.radarMode, RADAR_MODES, DEFAULT_MONITOR_SETTINGS.radarMode),
    radarProduct: readEnum(value.radarProduct, RADAR_PRODUCTS, DEFAULT_MONITOR_SETTINGS.radarProduct),
    radarSite: readSite(value.radarSite, DEFAULT_MONITOR_SETTINGS.radarSite),
    radarOpacity: readNumber(value.radarOpacity, DEFAULT_MONITOR_SETTINGS.radarOpacity, 0, 1),
    satelliteProduct: readEnum(value.satelliteProduct, SATELLITE_PRODUCTS, DEFAULT_MONITOR_SETTINGS.satelliteProduct),
    satelliteOpacity: readNumber(value.satelliteOpacity, DEFAULT_MONITOR_SETTINGS.satelliteOpacity, 0, 1),
    outlookSource: readOutlookSource(value.outlookSource),
    outlookType: readEnum(value.outlookType, OUTLOOK_LAYER_TYPES, DEFAULT_MONITOR_SETTINGS.outlookType),
    mapView: readMapView(value.mapView),
    animationEnabled: readBooleanSetting(value.animationEnabled, DEFAULT_MONITOR_SETTINGS.animationEnabled),
    animationSpeedMs: readNumber(value.animationSpeedMs, DEFAULT_MONITOR_SETTINGS.animationSpeedMs, 150, 2000),
    stormReportsEnabled: readBooleanSetting(value.stormReportsEnabled, DEFAULT_MONITOR_SETTINGS.stormReportsEnabled),
    stormReportsFilterTornado: readBooleanSetting(
      value.stormReportsFilterTornado,
      DEFAULT_MONITOR_SETTINGS.stormReportsFilterTornado,
    ),
    stormReportsFilterWind: readBooleanSetting(
      value.stormReportsFilterWind,
      DEFAULT_MONITOR_SETTINGS.stormReportsFilterWind,
    ),
    stormReportsFilterHail: readBooleanSetting(
      value.stormReportsFilterHail,
      DEFAULT_MONITOR_SETTINGS.stormReportsFilterHail,
    ),
    stormReportsMatchOutlookType: readBooleanSetting(
      value.stormReportsMatchOutlookType,
      DEFAULT_MONITOR_SETTINGS.stormReportsMatchOutlookType,
    ),
    alertsEnabled: readBooleanSetting(value.alertsEnabled, DEFAULT_MONITOR_SETTINGS.alertsEnabled),
    alertsOpacity: readNumber(value.alertsOpacity, DEFAULT_MONITOR_SETTINGS.alertsOpacity, 0, 1),
    alertsShowWatches: readBooleanSetting(value.alertsShowWatches, DEFAULT_MONITOR_SETTINGS.alertsShowWatches),
    alertsShowWarnings: readBooleanSetting(value.alertsShowWarnings, DEFAULT_MONITOR_SETTINGS.alertsShowWarnings),
    alertsShowAdvisories: readBooleanSetting(value.alertsShowAdvisories, DEFAULT_MONITOR_SETTINGS.alertsShowAdvisories),
    referenceLayers: readReferenceLayers(value.referenceLayers),
  };
};
