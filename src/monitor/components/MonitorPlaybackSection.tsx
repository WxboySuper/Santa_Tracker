import React from 'react';
import { CloudSun, Pause, Play } from 'lucide-react';
import type { MonitorSettings } from '../types';
import { Button } from '../../components/ui/button';
import MonitorControlsSection from './MonitorControlsSection';

interface MonitorPlaybackSectionProps {
  settings: MonitorSettings;
  syncLabel: string;
  onAnimationEnabledChange: (enabled: boolean) => void;
  onAnimationSpeedChange: (speed: number) => void;
}

/** Renders monitor animation playback controls. */
const MonitorPlaybackSection: React.FC<MonitorPlaybackSectionProps> = ({
  settings,
  syncLabel,
  onAnimationEnabledChange,
  onAnimationSpeedChange,
}) => (
  <MonitorControlsSection id="playback" title={<><CloudSun className="h-4 w-4" /> Playback</>} defaultCollapsed>
    <div className="monitor-controls__buttonRow">
      <Button
        type="button"
        size="sm"
        variant={settings.animationEnabled ? 'secondary' : 'outline'}
        onClick={() => onAnimationEnabledChange(!settings.animationEnabled)}
      >
        {settings.animationEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {settings.animationEnabled ? 'Pause' : 'Play'}
      </Button>
      <span>{syncLabel}</span>
    </div>
    <label>
      Speed
      <input
        type="range"
        min="150"
        max="2000"
        step="100"
        value={settings.animationSpeedMs}
        onChange={(event) => onAnimationSpeedChange(Number(event.target.value))}
      />
    </label>
  </MonitorControlsSection>
);

export default MonitorPlaybackSection;
