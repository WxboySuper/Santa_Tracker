import { useEffect, type RefObject } from 'react';
import OLMap from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import TileWMS from 'ol/source/TileWMS';
import { fromLonLat, toLonLat } from 'ol/proj';
import { apply } from 'ol-mapbox-style';
import { buildNwsAlertStyle } from '../nwsAlerts';
import { parseNwsAlertFromOlProperties } from '../nwsAlertDetails';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import { hideOverlay } from '../../components/Map/openLayersMapStyles';
import { clearMonitorAlertPopup } from './renderMonitorAlertPopup';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { setMonitorMapView } from '../../store/monitorSlice';
import type { MonitorMapView } from '../types';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import {
  BASE_LAYER_Z_INDEX,
  createBaseSource,
  createMesoscaleDiscussionStyle,
  loadUsStateOutlines,
  MONITOR_LAYER_Z_ORDER,
  RADAR_LAYER_Z_INDEX,
  replaceLayerGroupLayers,
  SATELLITE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
} from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapBootstrapArgs {
  mapView: MonitorMapView;
  darkMode: boolean;
  radarOpacity: number;
  satelliteOpacity: number;
  alertsOpacity: number;
  mapElementRef: RefObject<HTMLDivElement | null>;
  refs: MonitorMapRefs;
  onSelectAlert: (details: NwsAlertDetails | null) => void;
}

interface MonitorMapLayers {
  alerts: VectorLayer;
  radar: TileLayer<TileWMS>;
  satellite: TileLayer<TileWMS>;
  mesoscaleDiscussion: VectorLayer;
  vectorReferenceGroup: LayerGroup;
  base: TileLayer;
}

interface MonitorMapLayerOptions {
  refs: MonitorMapRefs;
  radarOpacity: number;
  satelliteOpacity: number;
  alertsOpacity: number;
}

const createMonitorMapLayers = ({
  refs,
  radarOpacity,
  satelliteOpacity,
  alertsOpacity,
}: MonitorMapLayerOptions): MonitorMapLayers => ({
  alerts: new VectorLayer({
    source: refs.alertsSourceRef.current,
    opacity: alertsOpacity,
    zIndex: MONITOR_LAYER_Z_ORDER.alerts,
    style: (feature) => buildNwsAlertStyle(String(feature.get('event') ?? '')),
  }),
  radar: new TileLayer<TileWMS>({ visible: false, opacity: radarOpacity, zIndex: RADAR_LAYER_Z_INDEX }),
  satellite: new TileLayer<TileWMS>({ visible: false, opacity: satelliteOpacity, zIndex: SATELLITE_LAYER_Z_INDEX }),
  mesoscaleDiscussion: new VectorLayer({
    visible: false,
    source: refs.mesoscaleDiscussionSourceRef.current,
    style: createMesoscaleDiscussionStyle(),
    zIndex: MONITOR_LAYER_Z_ORDER.spcMesoscaleDiscussion,
  }),
  vectorReferenceGroup: new LayerGroup({ visible: false, zIndex: MONITOR_LAYER_Z_ORDER.mapReferenceControls }),
  base: new TileLayer({ zIndex: BASE_LAYER_Z_INDEX }),
});

const createMonitorMap = ({
  target,
  mapView,
  layers,
  refs,
}: {
  target: HTMLDivElement;
  mapView: MonitorMapView;
  layers: MonitorMapLayers;
  refs: MonitorMapRefs;
}): OLMap => new OLMap({
  target,
  layers: [
    layers.base,
    layers.satellite,
    layers.radar,
    layers.mesoscaleDiscussion,
    layers.alerts,
    new VectorLayer({ source: refs.outlookSourceRef.current, zIndex: MONITOR_LAYER_Z_ORDER.outlook }),
    new VectorLayer({ source: refs.stormReportsSourceRef.current, zIndex: MONITOR_LAYER_Z_ORDER.stormReports }),
    new VectorLayer({ source: refs.stateOutlineSourceRef.current, zIndex: MONITOR_LAYER_Z_ORDER.stateOutlines }),
    layers.vectorReferenceGroup,
  ],
  view: new View({
    center: fromLonLat([mapView.center[1], mapView.center[0]]),
    zoom: mapView.zoom,
    minZoom: 2,
    maxZoom: 14,
  }),
});

const createMoveEndHandler = ({ map, refs, dispatch }: {
  map: OLMap;
  refs: MonitorMapRefs;
  dispatch: AppDispatch;
}) => () => {
  if (refs.applyingExternalViewRef.current) return;
  const center = map.getView().getCenter();
  const zoom = map.getView().getZoom();
  if (!center || typeof zoom !== 'number') return;
  const [longitude, latitude] = toLonLat(center);
  dispatch(setMonitorMapView({ center: [latitude, longitude], zoom }));
};

const createMapClickHandler = ({ map, layers, refs, onSelectAlert }: {
  map: OLMap;
  layers: MonitorMapLayers;
  refs: MonitorMapRefs;
  onSelectAlert: (details: NwsAlertDetails | null) => void;
}) => (evt: { pixel: number[]; coordinate: number[] }) => {
  const feature = map.forEachFeatureAtPixel(
    evt.pixel,
    (candidate) => candidate.get('nwsAlert') ? candidate : undefined,
    { layerFilter: (layer) => layer === layers.alerts, hitTolerance: 6 },
  );

  if (feature && refs.overlayRef.current) {
    const details = parseNwsAlertFromOlProperties(feature.getProperties() as Record<string, unknown>);
    if (details) {
      onSelectAlert(details);
      refs.overlayRef.current.setPosition(evt.coordinate);
      return;
    }
  }

  if (refs.overlayRef.current) hideOverlay(refs.overlayRef.current);
  onSelectAlert(null);
};

const createPointerMoveHandler = ({ map, layers }: {
  map: OLMap;
  layers: MonitorMapLayers;
}) => (evt: { pixel: number[] }) => {
  const target = map.getTargetElement();
  if (!(target instanceof HTMLElement)) return;
  target.style.cursor = map.hasFeatureAtPixel(evt.pixel, {
    layerFilter: (layer) => layer === layers.alerts,
    hitTolerance: 6,
  }) ? 'pointer' : '';
};

const attachMonitorMapPopup = (map: OLMap, refs: MonitorMapRefs): void => {
  const popupEl = document.createElement('div');
  popupEl.className = 'monitor-map__alertOverlay';
  popupEl.setAttribute('translate', 'no');
  refs.popupElRef.current = popupEl;
  const overlay = new Overlay({ element: popupEl, autoPan: false });
  map.addOverlay(overlay);
  refs.overlayRef.current = overlay;
};

const assignMonitorMapRefs = (refs: MonitorMapRefs, map: OLMap, layers: MonitorMapLayers): void => {
  refs.mapRef.current = map;
  refs.baseLayerRef.current = layers.base;
  refs.radarLayerRef.current = layers.radar;
  refs.satelliteLayerRef.current = layers.satellite;
  refs.mesoscaleDiscussionLayerRef.current = layers.mesoscaleDiscussion;
  refs.alertsLayerRef.current = layers.alerts;
  refs.vectorReferenceGroupRef.current = layers.vectorReferenceGroup;
};

const loadVectorReferenceStyle = (refs: MonitorMapRefs): void => {
  const requestId = refs.vectorStyleRequestRef.current + 1;
  refs.vectorStyleRequestRef.current = requestId;
  getOpenFreeMapStyleSet('osm')
    .then(({ overlayStyle }) => {
      const nextReferenceGroup = new LayerGroup();
      return apply(nextReferenceGroup, overlayStyle).then(() => nextReferenceGroup);
    })
    .then((nextReferenceGroup) => {
      if (refs.vectorStyleRequestRef.current !== requestId || !refs.vectorReferenceGroupRef.current) return;
      replaceLayerGroupLayers(refs.vectorReferenceGroupRef.current, nextReferenceGroup);
      refs.vectorReferenceGroupRef.current.setZIndex(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
      refs.vectorReferenceGroupRef.current.setVisible(true);
    })
    .catch(() => undefined);
};

const clearMonitorMapRefs = (refs: MonitorMapRefs): void => {
  refs.mapRef.current = null;
  refs.baseLayerRef.current = null;
  refs.radarLayerRef.current = null;
  refs.satelliteLayerRef.current = null;
  refs.mesoscaleDiscussionLayerRef.current = null;
  refs.alertsLayerRef.current = null;
  refs.vectorReferenceGroupRef.current = null;
  refs.radarLayerKeyRef.current = null;
  refs.satelliteLayerKeyRef.current = null;
};

const cleanupMonitorMapPopup = (map: OLMap, refs: MonitorMapRefs): void => {
  if (refs.overlayRef.current) {
    map.removeOverlay(refs.overlayRef.current);
    refs.overlayRef.current = null;
  }
  if (refs.popupElRef.current) {
    clearMonitorAlertPopup(refs.popupElRef.current);
    refs.popupElRef.current.remove();
    refs.popupElRef.current = null;
  }
};

/** Initializes the monitor OpenLayers map, base layers, overlays, and map events. */
export const useMonitorMapBootstrap = ({
  mapView,
  darkMode,
  radarOpacity,
  satelliteOpacity,
  alertsOpacity,
  mapElementRef,
  refs,
  onSelectAlert,
}: UseMonitorMapBootstrapArgs) => {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!mapElementRef.current) {
      return undefined;
    }

    const layers = createMonitorMapLayers({ refs, radarOpacity, satelliteOpacity, alertsOpacity });
    const map = createMonitorMap({ target: mapElementRef.current, mapView, layers, refs });
    const handleMoveEnd = createMoveEndHandler({ map, refs, dispatch });
    const handleMapClick = createMapClickHandler({ map, layers, refs, onSelectAlert });
    const handlePointerMove = createPointerMoveHandler({ map, layers });

    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);
    map.on('pointermove', handlePointerMove);
    attachMonitorMapPopup(map, refs);
    assignMonitorMapRefs(refs, map, layers);
    loadUsStateOutlines(refs.stateOutlineSourceRef.current, darkMode).catch(() => undefined);
    loadVectorReferenceStyle(refs);

    return () => {
      map.un('moveend', handleMoveEnd);
      map.un('click', handleMapClick);
      map.un('pointermove', handlePointerMove);
      const target = map.getTargetElement();
      if (target instanceof HTMLElement) {
        target.style.cursor = '';
      }
      onSelectAlert(null);
      cleanupMonitorMapPopup(map, refs);
      map.setTarget();
      clearMonitorMapRefs(refs);
    };
    // Mount-only: rebuilding the map when any captured prop changes would tear down
    // and recreate the OpenLayers instance. Dedicated effects handle darkMode and view updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    const baseLayer = refs.baseLayerRef.current;
    if (!baseLayer) {
      return undefined;
    }

    baseLayer.setSource(createBaseSource(darkMode));
    return undefined;
  }, [darkMode, refs.baseLayerRef]);
};
