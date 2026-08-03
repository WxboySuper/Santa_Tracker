import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { RootState, AppDispatch } from '../store';
import {
  setAnimationEnabled,
  setAnimationSpeedMs,
  setMonitorOutlookSource,
  setMonitorOutlookType,
  setAlertsEnabled,
  setAlertsOpacity,
  setAlertsShowAdvisories,
  setAlertsShowWarnings,
  setAlertsShowWatches,
  setStormReportsEnabled,
  setStormReportsFilterHail,
  setStormReportsFilterTornado,
  setStormReportsFilterWind,
  setStormReportsMatchOutlookType,
  setRadarMode,
  setRadarOpacity,
  setRadarProduct,
  setRadarSite,
  setSatelliteOpacity,
  setSatelliteProduct,
} from '../store/monitorSlice';
import { selectForecastCycle, selectSavedCycles } from '../store/forecastSlice';
import { useEntitlement } from '../billing/EntitlementProvider';
import { useCloudCycles } from '../hooks/useCloudCycles';
import type { AddToastFn } from '../components/Layout';
import { MonitorControls, MonitorMap } from '../monitor/components';
import { buildMonitorOutlookOptions, resolveSelectedOutlookOption } from '../monitor/outlookSources';
import type { MonitorOutlookSourceOption } from '../monitor/outlookSources';
import type { MonitorSettings } from '../monitor/types';
import { useLocalMonitorSettings } from './useLocalMonitorSettings';
import { useMonitorCloudOutlook } from './useMonitorCloudOutlook';
import { usePremiumMonitorSettingsSync } from './usePremiumMonitorSettingsSync';
import { buildRadarLayerConfig, buildSatelliteLayerConfig } from '../monitor/wms';
import { useLiveWmsLayers } from '../monitor/useLiveWmsLayers';
import { useMonitorNwsAlerts } from '../monitor/useMonitorNwsAlerts';
import { useMonitorStormReports } from '../monitor/useMonitorStormReports';
import { useRadarSiteOptions } from '../monitor/useRadarSiteOptions';
import { getLocalCalendarDate } from '../utils/localDate';
import './MonitorPage.css';

interface PageContext {
  addToast: AddToastFn;
}

/** Resolves a handoff source only when its kind and ID match a real Monitor option. */
const resolveHandoffSource = (
  searchParams: URLSearchParams,
  options: MonitorOutlookSourceOption[],
): MonitorOutlookSourceOption | undefined => {
  const sourceKind = searchParams.get('sourceKind');
  const sourceId = searchParams.get('sourceId');
  if (sourceKind && sourceId) {
    return options.find((option) => option.kind === sourceKind && option.id === sourceId);
  }
  if (searchParams.get('workflowId')) {
    return options.find((option) => option.kind === 'current' && option.id === 'current');
  }
  return undefined;
};

interface MonitorPageWorkspaceProps {
  settings: MonitorSettings;
  outlookOptions: MonitorOutlookSourceOption[];
  selectedOutlook: MonitorOutlookSourceOption;
  radarSiteOptions: ReturnType<typeof useRadarSiteOptions>['sites'];
  radarSitesLoading?: boolean;
  radarSitesError?: string;
  radarDisplayTime?: string;
  satelliteDisplayTime?: string;
  radarLayer: ReturnType<typeof buildRadarLayerConfig> | null;
  satelliteLayer: ReturnType<typeof buildSatelliteLayerConfig> | null;
  statusMessage: string;
  syncLabel: string;
  stormReportState: ReturnType<typeof useMonitorStormReports>;
  alertState: ReturnType<typeof useMonitorNwsAlerts>;
  onRefresh: () => void;
  onOutlookSourceChange: (source: MonitorSettings['outlookSource']) => void;
  onOutlookTypeChange: (type: MonitorSettings['outlookType']) => void;
  dispatch: AppDispatch;
}

const MonitorPageWorkspace: React.FC<MonitorPageWorkspaceProps> = ({
  settings,
  outlookOptions,
  selectedOutlook,
  radarSiteOptions,
  radarSitesLoading,
  radarSitesError,
  radarDisplayTime,
  satelliteDisplayTime,
  radarLayer,
  satelliteLayer,
  statusMessage,
  syncLabel,
  stormReportState,
  alertState,
  onRefresh,
  onOutlookSourceChange,
  onOutlookTypeChange,
  dispatch,
}) => (
    <div className="monitor-page">
      <MonitorControls
        settings={settings}
        outlookOptions={outlookOptions}
        selectedOutlook={selectedOutlook}
        radarSiteOptions={radarSiteOptions}
        radarSitesLoading={radarSitesLoading}
        radarSitesError={radarSitesError}
        radarLatestTime={radarDisplayTime}
        satelliteLatestTime={satelliteDisplayTime}
        statusMessage={statusMessage}
        syncLabel={syncLabel}
        onRadarModeChange={(mode) => dispatch(setRadarMode(mode))}
        onRadarProductChange={(product) => dispatch(setRadarProduct(product))}
        onRadarSiteChange={(site) => dispatch(setRadarSite(site))}
        onRadarOpacityChange={(opacity) => dispatch(setRadarOpacity(opacity))}
        onSatelliteProductChange={(product) => dispatch(setSatelliteProduct(product))}
        onSatelliteOpacityChange={(opacity) => dispatch(setSatelliteOpacity(opacity))}
        onOutlookSourceChange={onOutlookSourceChange}
        onOutlookTypeChange={onOutlookTypeChange}
        stormReportsMeta={stormReportState}
        onStormReportsEnabledChange={(enabled) => dispatch(setStormReportsEnabled(enabled))}
        onStormReportsFilterTornadoChange={(enabled) => dispatch(setStormReportsFilterTornado(enabled))}
        onStormReportsFilterWindChange={(enabled) => dispatch(setStormReportsFilterWind(enabled))}
        onStormReportsFilterHailChange={(enabled) => dispatch(setStormReportsFilterHail(enabled))}
        onStormReportsMatchOutlookTypeChange={(enabled) => dispatch(setStormReportsMatchOutlookType(enabled))}
        alertsMeta={alertState}
        onAlertsEnabledChange={(enabled) => dispatch(setAlertsEnabled(enabled))}
        onAlertsOpacityChange={(opacity) => dispatch(setAlertsOpacity(opacity))}
        onAlertsShowWatchesChange={(enabled) => dispatch(setAlertsShowWatches(enabled))}
        onAlertsShowWarningsChange={(enabled) => dispatch(setAlertsShowWarnings(enabled))}
        onAlertsShowAdvisoriesChange={(enabled) => dispatch(setAlertsShowAdvisories(enabled))}
        onAnimationEnabledChange={(enabled) => dispatch(setAnimationEnabled(enabled))}
        onAnimationSpeedChange={(speed) => dispatch(setAnimationSpeedMs(speed))}
        onRefresh={onRefresh}
      />

      <MonitorMap
        mapView={settings.mapView}
        radarLayer={radarLayer}
        radarOpacity={settings.radarOpacity}
        satelliteLayer={satelliteLayer}
        satelliteOpacity={settings.satelliteOpacity}
        outlookData={selectedOutlook.data}
        outlookType={settings.outlookType}
        stormReports={stormReportState.reports}
        alertsCollection={alertState.alertCollection}
        alertsOpacity={settings.alertsOpacity}
      />
    </div>
);

/** Real-time monitor page for radar, satellite, and read-only personal outlook overlays. */
export const MonitorPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { addToast } = useOutletContext<PageContext>();
  const [searchParams] = useSearchParams();
  const didApplyHandoffSource = useRef(false);
  const settings = useSelector((state: RootState) => state.monitor);
  const currentCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector(selectSavedCycles);
  const { cycles: cloudCycles, loading: cloudCyclesLoading } = useCloudCycles();
  const { premiumActive } = useEntitlement();
  const { sites: radarSiteOptions, loading: radarSitesLoading, error: radarSitesError } = useRadarSiteOptions();
  const today = useMemo(() => getLocalCalendarDate(), []);

  useLocalMonitorSettings(settings);
  usePremiumMonitorSettingsSync(settings);

  const outlookOptions = useMemo(() => buildMonitorOutlookOptions({
    currentCycle,
    savedCycles,
    cloudCycles: premiumActive ? cloudCycles : [],
    today,
  }), [cloudCycles, currentCycle, premiumActive, savedCycles, today]);

  const selectedOption = useMemo(
    () => resolveSelectedOutlookOption(outlookOptions, settings.outlookSource),
    [outlookOptions, settings.outlookSource]
  );

  useEffect(() => {
    if (didApplyHandoffSource.current) return;
    const matchingSource = resolveHandoffSource(searchParams, outlookOptions);
    if (matchingSource) {
      dispatch(setMonitorOutlookSource({ kind: matchingSource.kind, id: matchingSource.id }));
      didApplyHandoffSource.current = true;
    }
  }, [dispatch, outlookOptions, searchParams]);
  const selectedOutlook = useMonitorCloudOutlook({ selectedOption, today, addToast });

  const radarConfig = useMemo(() => buildRadarLayerConfig(settings), [settings]);
  const satelliteConfig = useMemo(() => buildSatelliteLayerConfig(settings.satelliteProduct), [settings.satelliteProduct]);
  const [refreshToken, setRefreshToken] = useState(0);
  const { radarDisplayTime, satelliteDisplayTime } = useLiveWmsLayers({
    radarConfig,
    satelliteConfig,
    animationEnabled: settings.animationEnabled,
    animationSpeedMs: settings.animationSpeedMs,
    refreshToken,
    addToast,
  });

  const stormReportState = useMonitorStormReports({
    enabled: settings.stormReportsEnabled,
    filterTornado: settings.stormReportsFilterTornado,
    filterWind: settings.stormReportsFilterWind,
    filterHail: settings.stormReportsFilterHail,
    matchOutlookType: settings.stormReportsMatchOutlookType,
    outlookType: settings.outlookType,
    refreshToken,
    addToast,
  });

  const alertState = useMonitorNwsAlerts({
    enabled: settings.alertsEnabled,
    showWatches: settings.alertsShowWatches,
    showWarnings: settings.alertsShowWarnings,
    showAdvisories: settings.alertsShowAdvisories,
    animationEnabled: settings.animationEnabled,
    animationSpeedMs: settings.animationSpeedMs,
    refreshToken,
    addToast,
  });

  const handleRefreshLiveLayers = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const radarLayer = useMemo(
    () => radarConfig ? { ...radarConfig, latestTime: radarDisplayTime } : null,
    [radarConfig, radarDisplayTime]
  );
  const satelliteLayer = useMemo(
    () => satelliteConfig ? { ...satelliteConfig, latestTime: satelliteDisplayTime } : null,
    [satelliteConfig, satelliteDisplayTime]
  );

  const handleOutlookSourceChange = useCallback((source: MonitorSettings['outlookSource']) => {
    dispatch(setMonitorOutlookSource(source));
  }, [dispatch]);

  const handleOutlookTypeChange = useCallback((type: MonitorSettings['outlookType']) => {
    dispatch(setMonitorOutlookType(type));
  }, [dispatch]);

  const syncLabel = premiumActive ? 'Cloud sync eligible' : 'Local settings';
  const statusMessage = cloudCyclesLoading
    ? 'Loading saved outlook sources.'
    : 'Live radar, satellite, SPC reports, and NWS alerts refresh with Playback or Refresh.';

  return (
    <MonitorPageWorkspace
      settings={settings}
      outlookOptions={outlookOptions}
      selectedOutlook={selectedOutlook}
      radarSiteOptions={radarSiteOptions}
      radarSitesLoading={radarSitesLoading}
      radarSitesError={radarSitesError}
      radarDisplayTime={radarDisplayTime}
      satelliteDisplayTime={satelliteDisplayTime}
      radarLayer={radarLayer}
      satelliteLayer={satelliteLayer}
      statusMessage={statusMessage}
      syncLabel={syncLabel}
      stormReportState={stormReportState}
      alertState={alertState}
      onRefresh={handleRefreshLiveLayers}
      onOutlookSourceChange={handleOutlookSourceChange}
      onOutlookTypeChange={handleOutlookTypeChange}
      dispatch={dispatch}
    />
  );
};

export default MonitorPage;
