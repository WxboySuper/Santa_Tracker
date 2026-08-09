import React from 'react';
import { Layers } from 'lucide-react';
import { formatMonitorReferenceTime, type MonitorReferenceLayerMeta } from '../referenceLayers';
import type { MonitorReferenceLayerSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';

interface MonitorReferenceLayersSectionProps {
  settings: MonitorReferenceLayerSettings;
  ndfdMeta: MonitorReferenceLayerMeta;
  spcMeta: MonitorReferenceLayerMeta;
  onNdfdEnabledChange: (enabled: boolean) => void;
  onSpcEnabledChange: (enabled: boolean) => void;
}

const statusText = (meta: MonitorReferenceLayerMeta, emptyLabel: string): string => {
  if (meta.status === 'loading') return `Loading ${meta.sourceName}…`;
  if (meta.status === 'error') return `${meta.error ?? 'Source unavailable.'}${meta.validTime ? ` · last ${formatMonitorReferenceTime(meta.validTime)}` : ''}`;
  if (meta.status === 'stale') return `Stale snapshot · ${meta.error ?? 'refresh recommended'} · last ${formatMonitorReferenceTime(meta.validTime)}`;
  if (meta.status === 'empty') return emptyLabel;
  if (meta.status === 'ready') return `${meta.itemCount} product${meta.itemCount === 1 ? '' : 's'} · valid ${formatMonitorReferenceTime(meta.validTime)}`;
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
    <div className="monitor-controls__meta" title={ndfdMeta.sourceUrl} aria-live="polite">
      {statusText(ndfdMeta, 'No NDFD forecast is available.')}
      <span className="monitor-controls__source"> · <a href={ndfdMeta.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${ndfdMeta.sourceName} source`}>{ndfdMeta.attribution}</a></span>
    </div>
    <label className="monitor-controls__checkbox">
      <input
        type="checkbox"
        checked={settings.spcMesoscaleDiscussionEnabled}
        onChange={(event) => onSpcEnabledChange(event.target.checked)}
      />
      SPC mesoscale discussions
    </label>
    <div className="monitor-controls__meta" title={spcMeta.sourceUrl} aria-live="polite">
      {statusText(spcMeta, 'No active SPC mesoscale discussions.')}
      <span className="monitor-controls__source"> · <a href={spcMeta.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${spcMeta.sourceName} source`}>{spcMeta.attribution}</a></span>
    </div>
  </MonitorControlsSection>
);

export default MonitorReferenceLayersSection;
