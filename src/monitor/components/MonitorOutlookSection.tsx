import React from 'react';
import { Shapes } from 'lucide-react';
import type { MonitorOutlookSourceOption } from '../outlookSources';
import {
  MONITOR_OUTLOOK_LAYER_LABELS,
  MONITOR_OUTLOOK_LAYER_TYPES,
} from '../outlookLayers';
import type { MonitorOutlookLayerType, MonitorOutlookSourceSelection, MonitorSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';
import { parseSourceValue, sourceValue } from './monitorControlsUtils';

interface MonitorOutlookSectionProps {
  settings: MonitorSettings;
  outlookOptions: MonitorOutlookSourceOption[];
  selectedOutlook: MonitorOutlookSourceOption;
  onOutlookSourceChange: (source: MonitorOutlookSourceSelection) => void;
  onOutlookTypeChange: (type: MonitorOutlookLayerType) => void;
}

/** Renders monitor outlook source and hazard layer selectors. */
const MonitorOutlookSection: React.FC<MonitorOutlookSectionProps> = ({
  settings,
  outlookOptions,
  selectedOutlook,
  onOutlookSourceChange,
  onOutlookTypeChange,
}) => (
  <MonitorControlsSection id="outlooks" title={<><Shapes className="h-4 w-4" /> Outlooks</>}>
    <label>
      Source
      <select
        aria-label="Outlook source"
        value={sourceValue(selectedOutlook)}
        onChange={(event) => onOutlookSourceChange(parseSourceValue(event.target.value))}
      >
        {outlookOptions.map((option) => (
          <option key={`${option.kind}:${option.id}`} value={sourceValue(option)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
    <label>
      Outlook type
      <select
        aria-label="Outlook type"
        value={settings.outlookType}
        onChange={(event) => onOutlookTypeChange(event.target.value as MonitorOutlookLayerType)}
      >
        {MONITOR_OUTLOOK_LAYER_TYPES.map((type) => (
          <option key={type} value={type}>
            {MONITOR_OUTLOOK_LAYER_LABELS[type]}
          </option>
        ))}
      </select>
    </label>
    <div className="monitor-controls__meta">{selectedOutlook.status || `Cycle ${selectedOutlook.cycleDate}`}</div>
  </MonitorControlsSection>
);

export default MonitorOutlookSection;
