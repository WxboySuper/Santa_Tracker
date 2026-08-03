import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { MonitorSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';
import { formatAlertsStatusLine } from './monitorControlsUtils';

interface MonitorAlertsMeta {
  alertCollection: NwsAlertFeatureCollection;
  frameCount: number;
  frameIndex: number;
  loading: boolean;
  error: string | null;
  polygonCount: number;
}

interface MonitorAlertCategoryCheckboxProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}

/** Toggles one NWS alert category within the monitor controls. */
const MonitorAlertCategoryCheckbox: React.FC<MonitorAlertCategoryCheckboxProps> = ({
  label,
  checked,
  disabled,
  onChange,
}) => (
  <label className="monitor-controls__checkbox">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    {label}
  </label>
);

interface MonitorAlertsSectionProps {
  settings: MonitorSettings;
  alertsMeta: MonitorAlertsMeta;
  onAlertsEnabledChange: (enabled: boolean) => void;
  onAlertsOpacityChange: (opacity: number) => void;
  onAlertsShowWatchesChange: (enabled: boolean) => void;
  onAlertsShowWarningsChange: (enabled: boolean) => void;
  onAlertsShowAdvisoriesChange: (enabled: boolean) => void;
}

/** Groups NWS watch, warning, and advisory controls for the monitor map. */
const MonitorAlertsSection: React.FC<MonitorAlertsSectionProps> = ({
  settings,
  alertsMeta,
  onAlertsEnabledChange,
  onAlertsOpacityChange,
  onAlertsShowWatchesChange,
  onAlertsShowWarningsChange,
  onAlertsShowAdvisoriesChange,
}) => {
  const statusLine = !alertsMeta.loading && !alertsMeta.error && settings.alertsEnabled
    ? formatAlertsStatusLine(alertsMeta.polygonCount, alertsMeta.frameCount, alertsMeta.frameIndex)
    : null;

  return (
    <MonitorControlsSection id="alerts" title={<><AlertTriangle className="h-4 w-4" /> Watches &amp; warnings</>}>
      <label className="monitor-controls__checkbox">
        <input
          type="checkbox"
          checked={settings.alertsEnabled}
          onChange={(event) => onAlertsEnabledChange(event.target.checked)}
        />
        Show official NWS polygons
      </label>
      <label>
        Opacity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.alertsOpacity}
          disabled={!settings.alertsEnabled}
          onChange={(event) => onAlertsOpacityChange(Number(event.target.value))}
        />
      </label>
      <MonitorAlertCategoryCheckbox
        label="Watches"
        checked={settings.alertsShowWatches}
        disabled={!settings.alertsEnabled}
        onChange={onAlertsShowWatchesChange}
      />
      <MonitorAlertCategoryCheckbox
        label="Warnings"
        checked={settings.alertsShowWarnings}
        disabled={!settings.alertsEnabled}
        onChange={onAlertsShowWarningsChange}
      />
      <MonitorAlertCategoryCheckbox
        label="Advisories"
        checked={settings.alertsShowAdvisories}
        disabled={!settings.alertsEnabled}
        onChange={onAlertsShowAdvisoriesChange}
      />
      <div className="monitor-controls__meta">
        {alertsMeta.loading && 'Loading NWS alerts…'}
        {!alertsMeta.loading && alertsMeta.error}
        {statusLine}
      </div>
    </MonitorControlsSection>
  );
};

export default MonitorAlertsSection;
