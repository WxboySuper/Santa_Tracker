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
import { hideOverlay } from '../../components/Map/OpenLayersForecastMap';
import { clearMonitorAlertPopup } from './renderMonitorAlertPopup';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { setMonitorMapView } from '../../store/monitorSlice';
import type { MonitorMapView } from '../types';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import {
  ALERTS_LAYER_Z_INDEX,
  BASE_LAYER_Z_INDEX,
  createBaseSource,
  loadUsStateOutlines,
  OUTLOOK_LAYER_Z_INDEX,
  RADAR_LAYER_Z_INDEX,
  replaceLayerGroupLayers,
  SATELLITE_LAYER_Z_INDEX,
  STATE_OUTLINE_LAYER_Z_INDEX,
  STORM_REPORTS_LAYER_Z_INDEX,
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

    const alertsLayer = new VectorLayer({
      source: refs.alertsSourceRef.current,
      opacity: alertsOpacity,
      zIndex: ALERTS_LAYER_Z_INDEX,
      style: (feature) => buildNwsAlertStyle(String(feature.get('event') ?? '')),
    });
    const radarLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: radarOpacity,
      zIndex: RADAR_LAYER_Z_INDEX,
    });
    const satelliteLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: satelliteOpacity,
      zIndex: SATELLITE_LAYER_Z_INDEX,
    });
    const vectorReferenceGroup = new LayerGroup({
      visible: false,
      zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    const baseLayerInstance = new TileLayer({
      zIndex: BASE_LAYER_Z_INDEX,
    });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseLayerInstance,
        satelliteLayerInstance,
        radarLayerInstance,
        alertsLayer,
        new VectorLayer({ source: refs.outlookSourceRef.current, zIndex: OUTLOOK_LAYER_Z_INDEX }),
        new VectorLayer({ source: refs.stormReportsSourceRef.current, zIndex: STORM_REPORTS_LAYER_Z_INDEX }),
        new VectorLayer({ source: refs.stateOutlineSourceRef.current, zIndex: STATE_OUTLINE_LAYER_Z_INDEX }),
        vectorReferenceGroup,
      ],
      view: new View({
        center: fromLonLat([mapView.center[1], mapView.center[0]]),
        zoom: mapView.zoom,
        minZoom: 2,
        maxZoom: 14,
      }),
    });

    /** Persists user pan/zoom into monitor map view state. */
    const handleMoveEnd = () => {
      if (refs.applyingExternalViewRef.current) {
        return;
      }

      const center = map.getView().getCenter();
      const zoom = map.getView().getZoom();
      if (!center || typeof zoom !== 'number') {
        return;
      }

      const [longitude, latitude] = toLonLat(center);
      dispatch(setMonitorMapView({ center: [latitude, longitude], zoom }));
    };

    /** Opens or dismisses the NWS alert popup for the clicked feature. */
    const handleMapClick = (evt: { pixel: number[]; coordinate: number[] }) => {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        (candidate) => {
          if (candidate.get('nwsAlert')) {
            return candidate;
          }
          return undefined;
        },
        { layerFilter: (layer) => layer === alertsLayer, hitTolerance: 6 },
      );

      if (feature && refs.overlayRef.current) {
        const details = parseNwsAlertFromOlProperties(feature.getProperties() as Record<string, unknown>);
        if (details) {
          onSelectAlert(details);
          refs.overlayRef.current.setPosition(evt.coordinate);
          return;
        }
      }

      if (refs.overlayRef.current) {
        hideOverlay(refs.overlayRef.current);
      }
      onSelectAlert(null);
    };

    /** Toggles the pointer cursor when hovering clickable alert features. */
    const handlePointerMove = (evt: { pixel: number[] }) => {
      const target = map.getTargetElement();
      if (!(target instanceof HTMLElement)) {
        return;
      }

      target.style.cursor = map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: (layer) => layer === alertsLayer,
        hitTolerance: 6,
      }) ? 'pointer' : '';
    };

    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);
    map.on('pointermove', handlePointerMove);

    const popupEl = document.createElement("div");
    popupEl.className = "monitor-map__alertOverlay";
    popupEl.setAttribute("translate", "no");
    refs.popupElRef.current = popupEl;
    const overlay = new Overlay({ element: popupEl, autoPan: false });
    map.addOverlay(overlay);
    refs.overlayRef.current = overlay;

    refs.mapRef.current = map;
    refs.baseLayerRef.current = baseLayerInstance;
    refs.radarLayerRef.current = radarLayerInstance;
    refs.satelliteLayerRef.current = satelliteLayerInstance;
    refs.alertsLayerRef.current = alertsLayer;
    refs.vectorReferenceGroupRef.current = vectorReferenceGroup;

    loadUsStateOutlines(refs.stateOutlineSourceRef.current, darkMode).catch(() => undefined);

    const requestId = refs.vectorStyleRequestRef.current + 1;
    refs.vectorStyleRequestRef.current = requestId;
    getOpenFreeMapStyleSet('osm')
      .then(({ overlayStyle }) => {
        const nextReferenceGroup = new LayerGroup();
        return apply(nextReferenceGroup, overlayStyle).then(() => nextReferenceGroup);
      })
      .then((nextReferenceGroup) => {
        if (refs.vectorStyleRequestRef.current !== requestId || !refs.vectorReferenceGroupRef.current) {
          return undefined;
        }

        replaceLayerGroupLayers(refs.vectorReferenceGroupRef.current, nextReferenceGroup);
        refs.vectorReferenceGroupRef.current.setZIndex(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
        refs.vectorReferenceGroupRef.current.setVisible(true);
        return undefined;
      })
      .catch(() => undefined);

    return () => {
      map.un('moveend', handleMoveEnd);
      map.un('click', handleMapClick);
      map.un('pointermove', handlePointerMove);
      const target = map.getTargetElement();
      if (target instanceof HTMLElement) {
        target.style.cursor = '';
      }
      onSelectAlert(null);
      if (refs.popupElRef.current) {
        clearMonitorAlertPopup(refs.popupElRef.current);
      }
      if (refs.overlayRef.current) {
        map.removeOverlay(refs.overlayRef.current);
        refs.overlayRef.current = null;
      }
      if (refs.popupElRef.current) {
        refs.popupElRef.current.remove();
        refs.popupElRef.current = null;
      }
      map.setTarget();
      refs.mapRef.current = null;
      refs.baseLayerRef.current = null;
      refs.radarLayerRef.current = null;
      refs.satelliteLayerRef.current = null;
      refs.alertsLayerRef.current = null;
      refs.vectorReferenceGroupRef.current = null;
      refs.radarLayerKeyRef.current = null;
      refs.satelliteLayerKeyRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    const baseLayer = refs.baseLayerRef.current;
    if (!baseLayer) {
      return undefined;
    }

    baseLayer.setSource(createBaseSource(darkMode));
    // refs omitted: wrapper object from useMonitorMapRefs() is new each render.
    return undefined;
  }, [darkMode]);
};
