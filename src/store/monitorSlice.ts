import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MonitorMapView, MonitorOutlookLayerType, MonitorOutlookSourceSelection, MonitorReferenceLayerSettings, MonitorSettings } from '../monitor/types';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import { normalizeMonitorSettings } from '../monitor/monitorSettingsNormalize';
import { resolveRadarProductForMode } from '../monitor/wms';

export type MonitorState = MonitorSettings;

const initialState: MonitorState = DEFAULT_MONITOR_SETTINGS;

const monitorSlice = createSlice({
  name: 'monitor',
  initialState,
  reducers: {
    applyMonitorSettings: (_state, action: PayloadAction<Partial<MonitorSettings> | MonitorSettings>) =>
      normalizeMonitorSettings({
        ...DEFAULT_MONITOR_SETTINGS,
        ...action.payload,
      }),
    setRadarMode: (state, action: PayloadAction<MonitorSettings['radarMode']>) => {
      state.radarMode = action.payload;
      state.radarProduct = resolveRadarProductForMode(action.payload, state.radarProduct);
    },
    setRadarProduct: (state, action: PayloadAction<MonitorSettings['radarProduct']>) => {
      state.radarProduct = resolveRadarProductForMode(state.radarMode, action.payload);
    },
    setRadarSite: (state, action: PayloadAction<string>) => {
      const cleaned = action.payload.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!cleaned) {
        state.radarSite = '';
        return;
      }

      state.radarSite = cleaned.startsWith('K') ? cleaned : `K${cleaned}`.slice(0, 4);
    },
    setRadarOpacity: (state, action: PayloadAction<number>) => {
      state.radarOpacity = Math.min(1, Math.max(0, action.payload));
    },
    setSatelliteProduct: (state, action: PayloadAction<MonitorSettings['satelliteProduct']>) => {
      state.satelliteProduct = action.payload;
    },
    setSatelliteOpacity: (state, action: PayloadAction<number>) => {
      state.satelliteOpacity = Math.min(1, Math.max(0, action.payload));
    },
    setMonitorOutlookSource: (state, action: PayloadAction<MonitorOutlookSourceSelection>) => {
      state.outlookSource = action.payload;
    },
    setMonitorOutlookType: (state, action: PayloadAction<MonitorOutlookLayerType>) => {
      state.outlookType = action.payload;
    },
    setMonitorMapView: (state, action: PayloadAction<MonitorMapView>) => {
      state.mapView = action.payload;
    },
    setAnimationEnabled: (state, action: PayloadAction<boolean>) => {
      state.animationEnabled = action.payload;
    },
    setAnimationSpeedMs: (state, action: PayloadAction<number>) => {
      state.animationSpeedMs = Math.min(2000, Math.max(150, action.payload));
    },
    setStormReportsEnabled: (state, action: PayloadAction<boolean>) => {
      state.stormReportsEnabled = action.payload;
    },
    setStormReportsFilterTornado: (state, action: PayloadAction<boolean>) => {
      state.stormReportsFilterTornado = action.payload;
    },
    setStormReportsFilterWind: (state, action: PayloadAction<boolean>) => {
      state.stormReportsFilterWind = action.payload;
    },
    setStormReportsFilterHail: (state, action: PayloadAction<boolean>) => {
      state.stormReportsFilterHail = action.payload;
    },
    setStormReportsMatchOutlookType: (state, action: PayloadAction<boolean>) => {
      state.stormReportsMatchOutlookType = action.payload;
    },
    setAlertsEnabled: (state, action: PayloadAction<boolean>) => {
      state.alertsEnabled = action.payload;
    },
    setAlertsOpacity: (state, action: PayloadAction<number>) => {
      state.alertsOpacity = Math.min(1, Math.max(0, action.payload));
    },
    setAlertsShowWatches: (state, action: PayloadAction<boolean>) => {
      state.alertsShowWatches = action.payload;
    },
    setAlertsShowWarnings: (state, action: PayloadAction<boolean>) => {
      state.alertsShowWarnings = action.payload;
    },
    setAlertsShowAdvisories: (state, action: PayloadAction<boolean>) => {
      state.alertsShowAdvisories = action.payload;
    },
    setReferenceLayerEnabled: (
      state,
      action: PayloadAction<{ layer: keyof MonitorReferenceLayerSettings; enabled: boolean }>,
    ) => {
      state.referenceLayers[action.payload.layer] = action.payload.enabled;
    },
  },
});

export const {
  applyMonitorSettings,
  setRadarMode,
  setRadarProduct,
  setRadarSite,
  setRadarOpacity,
  setSatelliteProduct,
  setSatelliteOpacity,
  setMonitorOutlookSource,
  setMonitorOutlookType,
  setMonitorMapView,
  setAnimationEnabled,
  setAnimationSpeedMs,
  setStormReportsEnabled,
  setStormReportsFilterTornado,
  setStormReportsFilterWind,
  setStormReportsFilterHail,
  setStormReportsMatchOutlookType,
  setAlertsEnabled,
  setAlertsOpacity,
  setAlertsShowWatches,
  setAlertsShowWarnings,
  setAlertsShowAdvisories,
  setReferenceLayerEnabled,
} = monitorSlice.actions;

export default monitorSlice.reducer;
