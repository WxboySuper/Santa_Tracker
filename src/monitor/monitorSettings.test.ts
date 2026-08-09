import { DEFAULT_MONITOR_SETTINGS, MONITOR_OUTLOOK_LAYER_TYPES } from './types';
import { normalizeMonitorSettings } from './monitorSettingsNormalize';
import monitorReducer, { setRadarMode, setRadarSite } from '../store/monitorSlice';
import { readStoredMonitorSettings, writeStoredMonitorSettings, MONITOR_SETTINGS_STORAGE_KEY } from './storage';

describe('monitor settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loads outlook layer types without circular-import initialization errors', () => {
    expect(MONITOR_OUTLOOK_LAYER_TYPES).toEqual(['tornado', 'wind', 'hail', 'categorical']);
    expect(normalizeMonitorSettings({ outlookType: 'tornado' }).outlookType).toBe('tornado');
  });

  test('normalizes unknown settings with safe defaults and bounds', () => {
    const settings = normalizeMonitorSettings({
      radarMode: 'site',
      radarProduct: 'sr-bvel',
      radarSite: 'ktlx',
      radarOpacity: 99,
      satelliteProduct: 'goes-water-vapor',
      satelliteOpacity: -1,
      outlookSource: { kind: 'local-cycle', id: 'cycle-1' },
      mapView: { center: [100, -200], zoom: 99 },
      animationEnabled: true,
      animationSpeedMs: 99,
    });

    expect(settings).toEqual({
      ...DEFAULT_MONITOR_SETTINGS,
      radarMode: 'site',
      radarProduct: 'sr-bvel',
      radarSite: 'KTLX',
      radarOpacity: 1,
      satelliteProduct: 'goes-water-vapor',
      satelliteOpacity: 0,
      outlookSource: { kind: 'local-cycle', id: 'cycle-1' },
      mapView: { center: [90, -180], zoom: 14 },
      animationEnabled: true,
      animationSpeedMs: 150,
      referenceLayers: DEFAULT_MONITOR_SETTINGS.referenceLayers,
    });
  });

  test('allows partial radar site ids while typing', () => {
    const state = monitorReducer(DEFAULT_MONITOR_SETTINGS, setRadarSite('KT'));
    expect(state.radarSite).toBe('KT');
  });

  test('coerces radar product when switching source mode', () => {
    const state = monitorReducer(undefined, { type: 'init' });
    const siteState = monitorReducer(state, setRadarMode('site'));
    expect(siteState.radarProduct).toBe('sr-bref');

    const mrmsState = monitorReducer(
      { ...siteState, radarProduct: 'sr-bvel' },
      setRadarMode('mrms-conus')
    );
    expect(mrmsState.radarProduct).toBe('bref-qcd');
  });

  test('persists settings to localStorage with fallback on invalid content', () => {
    writeStoredMonitorSettings({ ...DEFAULT_MONITOR_SETTINGS, radarMode: 'mrms-conus' });
    expect(JSON.parse(localStorage.getItem(MONITOR_SETTINGS_STORAGE_KEY) || '{}').radarMode).toBe('mrms-conus');
    expect(readStoredMonitorSettings().radarMode).toBe('mrms-conus');

    localStorage.setItem(MONITOR_SETTINGS_STORAGE_KEY, 'not-json');
    expect(readStoredMonitorSettings()).toEqual(DEFAULT_MONITOR_SETTINGS);
  });
});
