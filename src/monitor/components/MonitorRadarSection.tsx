import React, { useMemo } from 'react';
import { Radar } from 'lucide-react';
import type { RadarSiteOption } from '../radarSites';
import { getRadarProductsForMode } from '../wms';
import type { MonitorSettings } from '../types';
import MonitorControlsSection from './MonitorControlsSection';
import { formatLayerTime } from './monitorControlsUtils';

interface MonitorRadarSiteFieldProps {
  radarSite: string;
  radarSiteOptions: RadarSiteOption[];
  radarSitesLoading?: boolean;
  radarSitesError?: string;
  selectedSiteLabel?: string;
  onRadarSiteChange: (site: string) => void;
}

/** Renders the radar site search field and selected-site status text. */
const MonitorRadarSiteField: React.FC<MonitorRadarSiteFieldProps> = ({
  radarSite,
  radarSiteOptions,
  radarSitesLoading,
  radarSitesError,
  selectedSiteLabel,
  onRadarSiteChange,
}) => (
  <label>
    Radar site
    <input
      value={radarSite}
      list="monitor-radar-site-list"
      maxLength={4}
      placeholder="Search KTLX, KOUN…"
      onInput={(event) => onRadarSiteChange(event.currentTarget.value)}
      aria-label="Radar site"
      autoComplete="off"
    />
    <datalist id="monitor-radar-site-list">
      {radarSiteOptions.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </datalist>
    <div className="monitor-controls__meta">
      {radarSitesLoading && 'Loading radar sites…'}
      {!radarSitesLoading && radarSitesError}
      {!radarSitesLoading && !radarSitesError && (selectedSiteLabel ?? 'Enter a four-character site ID (e.g. KTLX).')}
    </div>
  </label>
);

interface MonitorRadarSectionProps {
  settings: MonitorSettings;
  radarSiteOptions: RadarSiteOption[];
  radarSitesLoading?: boolean;
  radarSitesError?: string;
  radarLatestTime?: string;
  onRadarModeChange: (mode: MonitorSettings['radarMode']) => void;
  onRadarProductChange: (product: MonitorSettings['radarProduct']) => void;
  onRadarSiteChange: (site: string) => void;
  onRadarOpacityChange: (opacity: number) => void;
}

/** Renders radar source, product, site, and opacity controls. */
const MonitorRadarSection: React.FC<MonitorRadarSectionProps> = ({
  settings,
  radarSiteOptions,
  radarSitesLoading,
  radarSitesError,
  radarLatestTime,
  onRadarModeChange,
  onRadarProductChange,
  onRadarSiteChange,
  onRadarOpacityChange,
}) => {
  const radarProducts = useMemo(
    () => getRadarProductsForMode(settings.radarMode),
    [settings.radarMode],
  );
  const selectedSite = radarSiteOptions.find((site) => site.id === settings.radarSite);
  const radarEnabled = settings.radarMode !== 'none';

  return (
    <MonitorControlsSection id="radar" title={<><Radar className="h-4 w-4" /> Radar</>}>
      <label>
        Source
        <select
          aria-label="Radar source"
          value={settings.radarMode}
          onChange={(event) => onRadarModeChange(event.target.value as MonitorSettings['radarMode'])}
        >
          <option value="none">Off</option>
          <option value="mrms-conus">MRMS CONUS</option>
          <option value="site">Single site</option>
        </select>
      </label>

      {settings.radarMode === 'site' ? (
        <MonitorRadarSiteField
          radarSite={settings.radarSite}
          radarSiteOptions={radarSiteOptions}
          radarSitesLoading={radarSitesLoading}
          radarSitesError={radarSitesError}
          selectedSiteLabel={selectedSite?.label}
          onRadarSiteChange={onRadarSiteChange}
        />
      ) : null}

      {radarEnabled ? (
        <>
          <label>
            Product
            <select
              aria-label="Radar product"
              value={settings.radarProduct}
              onChange={(event) => onRadarProductChange(event.target.value as MonitorSettings['radarProduct'])}
            >
              {radarProducts.map((product) => (
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
              value={settings.radarOpacity}
              onChange={(event) => onRadarOpacityChange(Number(event.target.value))}
            />
          </label>
          <div className="monitor-controls__meta">{formatLayerTime(radarLatestTime)}</div>
        </>
      ) : null}
    </MonitorControlsSection>
  );
};

export default MonitorRadarSection;
