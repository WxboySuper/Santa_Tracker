import type { WmsLayerConfig } from '../wms';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorRadarWmsSync } from './useMonitorRadarWmsSync';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapWmsSyncArgs {
  darkMode: boolean;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  refs: MonitorMapRefs;
}

/** Synchronizes all monitor WMS layers for the current map settings. */
export const useMonitorMapWmsSync = ({
  darkMode,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  refs,
}: UseMonitorMapWmsSyncArgs) => {
  useMonitorRadarWmsSync(radarLayer, radarOpacity, refs, darkMode);
  useMonitorSatelliteWmsSync(satelliteLayer, satelliteOpacity, refs, darkMode);
};
