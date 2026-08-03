import React from 'react';
import { MapPin } from 'lucide-react';
import type { MonitorSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';
import { formatStormReportsStatusLine } from './monitorControlsUtils';

interface MonitorStormReportsMeta {
  reports: unknown[];
  loading: boolean;
  error: string | null;
  totalCount: number;
}

interface MonitorStormReportsSectionProps {
  settings: MonitorSettings;
  stormReportsMeta: MonitorStormReportsMeta;
  onStormReportsEnabledChange: (enabled: boolean) => void;
  onStormReportsFilterTornadoChange: (enabled: boolean) => void;
  onStormReportsFilterWindChange: (enabled: boolean) => void;
  onStormReportsFilterHailChange: (enabled: boolean) => void;
  onStormReportsMatchOutlookTypeChange: (enabled: boolean) => void;
}

const STORM_REPORT_FILTERS = [
  { key: 'tornado', label: 'Tornado', settingKey: 'stormReportsFilterTornado' },
  { key: 'wind', label: 'Wind', settingKey: 'stormReportsFilterWind' },
  { key: 'hail', label: 'Hail', settingKey: 'stormReportsFilterHail' },
] as const;

/** Renders SPC storm report visibility and filtering controls. */
const MonitorStormReportsSection: React.FC<MonitorStormReportsSectionProps> = ({
  settings,
  stormReportsMeta,
  onStormReportsEnabledChange,
  onStormReportsFilterTornadoChange,
  onStormReportsFilterWindChange,
  onStormReportsFilterHailChange,
  onStormReportsMatchOutlookTypeChange,
}) => {
  const filterHandlers = {
    stormReportsFilterTornado: onStormReportsFilterTornadoChange,
    stormReportsFilterWind: onStormReportsFilterWindChange,
    stormReportsFilterHail: onStormReportsFilterHailChange,
  };

  const statusLine = !stormReportsMeta.loading && !stormReportsMeta.error && settings.stormReportsEnabled
    ? formatStormReportsStatusLine(stormReportsMeta.reports.length, stormReportsMeta.totalCount)
    : null;

  return (
    <MonitorControlsSection id="storm-reports" title={<><MapPin className="h-4 w-4" /> SPC storm reports</>}>
      <label className="monitor-controls__checkbox">
        <input
          type="checkbox"
          checked={settings.stormReportsEnabled}
          onChange={(event) => onStormReportsEnabledChange(event.target.checked)}
        />
        Show today&apos;s SPC reports
      </label>
      {STORM_REPORT_FILTERS.map(({ label, settingKey }) => (
        <label key={settingKey} className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings[settingKey]}
            disabled={!settings.stormReportsEnabled}
            onChange={(event) => filterHandlers[settingKey](event.target.checked)}
          />
          {label}
        </label>
      ))}
      <label className="monitor-controls__checkbox">
        <input
          type="checkbox"
          checked={settings.stormReportsMatchOutlookType}
          disabled={!settings.stormReportsEnabled}
          onChange={(event) => onStormReportsMatchOutlookTypeChange(event.target.checked)}
        />
        Match selected outlook type
      </label>
      <div className="monitor-controls__meta">
        {stormReportsMeta.loading && 'Loading SPC today.csv…'}
        {!stormReportsMeta.loading && stormReportsMeta.error}
        {statusLine}
      </div>
    </MonitorControlsSection>
  );
};

export default MonitorStormReportsSection;
