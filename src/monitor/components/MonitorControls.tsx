import React from 'react';
import { RefreshCcw } from 'lucide-react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import { Button } from '../../components/ui/button';
import type { MonitorOutlookSourceOption } from '../outlookSources';
import type { RadarSiteOption } from '../radarSites';
import type { MonitorOutlookLayerType, MonitorOutlookSourceSelection, MonitorSettings } from '../types';
import MonitorAlertsSection from './MonitorAlertsSection';
import MonitorOutlookSection from './MonitorOutlookSection';
import MonitorPlaybackSection from './MonitorPlaybackSection';
import MonitorRadarSection from './MonitorRadarSection';
import MonitorSatelliteSection from './MonitorSatelliteSection';
import MonitorStormReportsSection from './MonitorStormReportsSection';

interface MonitorStormReportsMeta {
  reports: unknown[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  totalCount: number;
}

interface MonitorAlertsMeta {
  alertCollection: NwsAlertFeatureCollection;
  frameCount: number;
  frameIndex: number;
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  polygonCount: number;
}

interface MonitorControlsProps {
  settings: MonitorSettings;
  outlookOptions: MonitorOutlookSourceOption[];
  selectedOutlook: MonitorOutlookSourceOption;
  radarSiteOptions: RadarSiteOption[];
  radarSitesLoading?: boolean;
  radarSitesError?: string;
  radarLatestTime?: string;
  satelliteLatestTime?: string;
  statusMessage: string;
  syncLabel: string;
  onRadarModeChange: (mode: MonitorSettings['radarMode']) => void;
  onRadarProductChange: (product: MonitorSettings['radarProduct']) => void;
  onRadarSiteChange: (site: string) => void;
  onRadarOpacityChange: (opacity: number) => void;
  onSatelliteProductChange: (product: MonitorSettings['satelliteProduct']) => void;
  onSatelliteOpacityChange: (opacity: number) => void;
  onOutlookSourceChange: (source: MonitorOutlookSourceSelection) => void;
  onOutlookTypeChange: (type: MonitorOutlookLayerType) => void;
  stormReportsMeta: MonitorStormReportsMeta;
  onStormReportsEnabledChange: (enabled: boolean) => void;
  onStormReportsFilterTornadoChange: (enabled: boolean) => void;
  onStormReportsFilterWindChange: (enabled: boolean) => void;
  onStormReportsFilterHailChange: (enabled: boolean) => void;
  onStormReportsMatchOutlookTypeChange: (enabled: boolean) => void;
  alertsMeta: MonitorAlertsMeta;
  onAlertsEnabledChange: (enabled: boolean) => void;
  onAlertsOpacityChange: (opacity: number) => void;
  onAlertsShowWatchesChange: (enabled: boolean) => void;
  onAlertsShowWarningsChange: (enabled: boolean) => void;
  onAlertsShowAdvisoriesChange: (enabled: boolean) => void;
  onAnimationEnabledChange: (enabled: boolean) => void;
  onAnimationSpeedChange: (speed: number) => void;
  onRefresh: () => void;
}

/** Composes all monitor layer, source, and playback controls. */
const MonitorControls: React.FC<MonitorControlsProps> = ({
  settings,
  outlookOptions,
  selectedOutlook,
  radarSiteOptions,
  radarSitesLoading,
  radarSitesError,
  radarLatestTime,
  satelliteLatestTime,
  statusMessage,
  syncLabel,
  onRadarModeChange,
  onRadarProductChange,
  onRadarSiteChange,
  onRadarOpacityChange,
  onSatelliteProductChange,
  onSatelliteOpacityChange,
  onOutlookSourceChange,
  onOutlookTypeChange,
  stormReportsMeta,
  onStormReportsEnabledChange,
  onStormReportsFilterTornadoChange,
  onStormReportsFilterWindChange,
  onStormReportsFilterHailChange,
  onStormReportsMatchOutlookTypeChange,
  alertsMeta,
  onAlertsEnabledChange,
  onAlertsOpacityChange,
  onAlertsShowWatchesChange,
  onAlertsShowWarningsChange,
  onAlertsShowAdvisoriesChange,
  onAnimationEnabledChange,
  onAnimationSpeedChange,
  onRefresh,
}) => (
  <aside className="monitor-controls" aria-label="Monitor controls">
    <div className="monitor-controls__header">
      <div>
        <h1>Monitor</h1>
        <p>{statusMessage}</p>
      </div>
      <Button type="button" size="icon-sm" variant="outline" onClick={onRefresh} aria-label="Refresh live layers">
        <RefreshCcw className="h-4 w-4" />
      </Button>
    </div>

    <MonitorRadarSection
      settings={settings}
      radarSiteOptions={radarSiteOptions}
      radarSitesLoading={radarSitesLoading}
      radarSitesError={radarSitesError}
      radarLatestTime={radarLatestTime}
      onRadarModeChange={onRadarModeChange}
      onRadarProductChange={onRadarProductChange}
      onRadarSiteChange={onRadarSiteChange}
      onRadarOpacityChange={onRadarOpacityChange}
    />

    <MonitorSatelliteSection
      settings={settings}
      satelliteLatestTime={satelliteLatestTime}
      onSatelliteProductChange={onSatelliteProductChange}
      onSatelliteOpacityChange={onSatelliteOpacityChange}
    />

    <MonitorAlertsSection
      settings={settings}
      alertsMeta={alertsMeta}
      onAlertsEnabledChange={onAlertsEnabledChange}
      onAlertsOpacityChange={onAlertsOpacityChange}
      onAlertsShowWatchesChange={onAlertsShowWatchesChange}
      onAlertsShowWarningsChange={onAlertsShowWarningsChange}
      onAlertsShowAdvisoriesChange={onAlertsShowAdvisoriesChange}
    />

    <MonitorStormReportsSection
      settings={settings}
      stormReportsMeta={stormReportsMeta}
      onStormReportsEnabledChange={onStormReportsEnabledChange}
      onStormReportsFilterTornadoChange={onStormReportsFilterTornadoChange}
      onStormReportsFilterWindChange={onStormReportsFilterWindChange}
      onStormReportsFilterHailChange={onStormReportsFilterHailChange}
      onStormReportsMatchOutlookTypeChange={onStormReportsMatchOutlookTypeChange}
    />

    <MonitorOutlookSection
      settings={settings}
      outlookOptions={outlookOptions}
      selectedOutlook={selectedOutlook}
      onOutlookSourceChange={onOutlookSourceChange}
      onOutlookTypeChange={onOutlookTypeChange}
    />

    <MonitorPlaybackSection
      settings={settings}
      syncLabel={syncLabel}
      onAnimationEnabledChange={onAnimationEnabledChange}
      onAnimationSpeedChange={onAnimationSpeedChange}
    />
  </aside>
);

export default MonitorControls;
