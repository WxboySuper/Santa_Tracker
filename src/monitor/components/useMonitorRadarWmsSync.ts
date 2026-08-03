import { useEffect } from 'react';
import type { WmsLayerConfig } from '../wms';
import { applyWmsLayer, buildWmsParams } from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

/** Applies radar WMS layer source, opacity, and time updates. */
export const useMonitorRadarWmsSync = (
  radarLayer: WmsLayerConfig | null,
  radarOpacity: number,
  refs: MonitorMapRefs,
  darkMode: boolean,
) => {
  useEffect(() => {
    if (refs.radarLayerRef.current) {
      applyWmsLayer(refs.radarLayerRef.current, radarLayer, radarOpacity, refs.radarLayerKeyRef);
    }
    // refs omitted: useMonitorMapRefs() returns a new object each render; only darkMode should re-apply.
  }, [darkMode, radarLayer, radarOpacity]);

  useEffect(() => {
    const source = refs.radarLayerRef.current?.getSource();
    if (source && radarLayer) {
      source.updateParams(buildWmsParams(radarLayer));
    }
  }, [radarLayer?.latestTime]);
};
