import { useEffect } from 'react';
import type { WmsLayerConfig } from '../wms';
import { applyWmsLayer, buildWmsParams } from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

/** Applies the optional NDFD WMS source without coupling it to radar/satellite state. */
export const useMonitorReferenceWmsSync = (
  layerConfig: WmsLayerConfig | null,
  opacity: number,
  refs: MonitorMapRefs,
) => {
  useEffect(() => {
    if (refs.ndfdTemperatureLayerRef.current) {
      applyWmsLayer(
        refs.ndfdTemperatureLayerRef.current,
        layerConfig,
        opacity,
        refs.ndfdTemperatureLayerKeyRef,
      );
    }
  }, [layerConfig, opacity, refs.ndfdTemperatureLayerKeyRef, refs.ndfdTemperatureLayerRef]);

  useEffect(() => {
    const source = refs.ndfdTemperatureLayerRef.current?.getSource();
    if (source && layerConfig) {
      source.updateParams(buildWmsParams(layerConfig));
    }
  }, [layerConfig, layerConfig?.latestTime, refs.ndfdTemperatureLayerRef]);
};

