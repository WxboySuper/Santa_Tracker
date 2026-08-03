import { useEffect } from 'react';
import type { WmsLayerConfig } from '../wms';
import { applyWmsLayer, buildWmsParams } from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

/** Applies satellite WMS layer source, opacity, and time updates. */
export const useMonitorSatelliteWmsSync = (
  satelliteLayer: WmsLayerConfig | null,
  satelliteOpacity: number,
  refs: MonitorMapRefs,
  darkMode: boolean,
) => {
  useEffect(() => {
    if (refs.satelliteLayerRef.current) {
      applyWmsLayer(refs.satelliteLayerRef.current, satelliteLayer, satelliteOpacity, refs.satelliteLayerKeyRef);
    }
    // refs omitted: useMonitorMapRefs() returns a new object each render; only darkMode should re-apply.
  }, [darkMode, satelliteLayer, satelliteOpacity]);

  useEffect(() => {
    const source = refs.satelliteLayerRef.current?.getSource();
    if (source && satelliteLayer) {
      source.updateParams(buildWmsParams(satelliteLayer));
    }
  }, [satelliteLayer?.latestTime]);
};
