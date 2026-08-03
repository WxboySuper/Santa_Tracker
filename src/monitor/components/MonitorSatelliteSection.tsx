import React from 'react';
import { Satellite } from 'lucide-react';
import { SATELLITE_PRODUCTS } from '../wms';
import type { MonitorSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';
import { formatLayerTime } from './monitorControlsUtils';

interface MonitorSatelliteSectionProps {
  settings: MonitorSettings;
  satelliteLatestTime?: string;
  onSatelliteProductChange: (product: MonitorSettings['satelliteProduct']) => void;
  onSatelliteOpacityChange: (opacity: number) => void;
}

/** Renders satellite product and opacity controls for the monitor map. */
const MonitorSatelliteSection: React.FC<MonitorSatelliteSectionProps> = ({
  settings,
  satelliteLatestTime,
  onSatelliteProductChange,
  onSatelliteOpacityChange,
}) => (
  <MonitorControlsSection id="satellite" title={<><Satellite className="h-4 w-4" /> Satellite</>}>
    <label>
      Product
      <select
        aria-label="Satellite product"
        value={settings.satelliteProduct}
        onChange={(event) => onSatelliteProductChange(event.target.value as MonitorSettings['satelliteProduct'])}
      >
        {SATELLITE_PRODUCTS.map((product) => (
          <option key={product.value} value={product.value}>
            {product.label}
          </option>
        ))}
      </select>
    </label>
    <label>
      Opacity
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.satelliteOpacity}
        onChange={(event) => onSatelliteOpacityChange(Number(event.target.value))}
      />
    </label>
    <div className="monitor-controls__meta">{formatLayerTime(satelliteLatestTime)}</div>
  </MonitorControlsSection>
);

export default MonitorSatelliteSection;
