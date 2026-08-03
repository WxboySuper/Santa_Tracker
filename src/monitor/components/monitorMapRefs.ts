import { useRef } from 'react';
import OLMap from 'ol/Map';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import TileWMS from 'ol/source/TileWMS';
import Overlay from 'ol/Overlay';

/** Creates stable OpenLayers refs used by the monitor map lifecycle hooks. */
export const useMonitorMapRefs = () => ({
  overlayRef: useRef<Overlay | null>(null),
  popupElRef: useRef<HTMLDivElement | null>(null),
  mapRef: useRef<OLMap | null>(null),
  baseLayerRef: useRef<TileLayer | null>(null),
  radarLayerRef: useRef<TileLayer<TileWMS> | null>(null),
  satelliteLayerRef: useRef<TileLayer<TileWMS> | null>(null),
  alertsLayerRef: useRef<VectorLayer<VectorSource> | null>(null),
  vectorReferenceGroupRef: useRef<LayerGroup | null>(null),
  vectorStyleRequestRef: useRef(0),
  radarLayerKeyRef: useRef<string | null>(null),
  satelliteLayerKeyRef: useRef<string | null>(null),
  outlookSourceRef: useRef(new VectorSource()),
  alertsSourceRef: useRef(new VectorSource()),
  stormReportsSourceRef: useRef(new VectorSource()),
  stateOutlineSourceRef: useRef(new VectorSource()),
  applyingExternalViewRef: useRef(false),
});
