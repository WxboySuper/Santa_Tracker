import React from 'react';
import { Layers } from 'lucide-react';
import type { MonitorReferenceLayerMeta } from '../referenceLayers';
import type { MonitorReferenceLayerSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';

interface MonitorReferenceLayersSectionProps {
  settings: MonitorReferenceLayerSettings;
  ndfdMeta: MonitorReferenceLayerMeta;
  spcMeta: MonitorReferenceLayerMeta;
  onNdfdEnabledChange: (enabled: boolean) => void;
  onSpcEnabledChange: (enabled: boolean) => void;
}

const formatValidTime = (value: string | null): string => {
  if (!value) return 'provider latest';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};

const statusText = (meta: MonitorReferenceLayerMeta, emptyLabel: string): string => {
  if (meta.status === 'loading') return `Loading ${meta.sourceName}…`;
  if (meta.status === 'error') return meta.error ?? 'Source unavailable.';
  if (meta.status === 'stale') return `Stale snapshot · ${meta.error ?? 'refresh recommended'}`;
  if (meta.status === 'empty') return emptyLabel;
  if (meta.status === 'ready') {
    const itemSummary = meta.itemCount === null
      ? 'Available'
      : `${meta.itemCount} product${meta.itemCount === 1 ? '' : 's'}`;
    return `${itemSummary} · valid ${formatValidTime(meta.validTime)}`;
  }
  return 'Off';
};

/** Groups optional official forecast and mesoscale-discussion reference layers. */
const MonitorReferenceLayersSection: React.FC<MonitorReferenceLayersSectionProps> = ({
  settings,
  ndfdMeta,
  spcMeta,
  onNdfdEnabledChange,
  onSpcEnabledChange,
}) => (
  <MonitorControlsSection id="reference-layers" title={<><Layers className="h-4 w-4" /> Reference layers</>} defaultCollapsed>
    <label className="monitor-controls__checkbox">
      <input
        type="checkbox"
        checked={settings.ndfdTemperatureEnabled}
        onChange={(event) => onNdfdEnabledChange(event.target.checked)}
      />
      NDFD temperature forecast
    </label>
    <div className="monitor-controls__meta" title={ndfdMeta.sourceUrl}>
      {statusText(ndfdMeta, 'No NDFD forecast is available.')}
      {ndfdMeta.status !== 'idle' ? <span className="monitor-controls__source"> · {ndfdMeta.attribution}</span> : null}
    </div>
    <label className="monitor-controls__checkbox">
      <input
        type="checkbox"
        checked={settings.spcMesoscaleDiscussionEnabled}
        onChange={(event) => onSpcEnabledChange(event.target.checked)}
      />
      SPC mesoscale discussions
    </label>
    <div className="monitor-controls__meta" title={spcMeta.sourceUrl}>
      {statusText(spcMeta, 'No active SPC mesoscale discussions.')}
      {spcMeta.status !== 'idle' ? <span className="monitor-controls__source"> · {spcMeta.attribution}</span> : null}
    </div>
  </MonitorControlsSection>
);

export default MonitorReferenceLayersSection;
