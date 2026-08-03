import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useSelector } from 'react-redux';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import { hideOverlay } from '../../components/Map/OpenLayersForecastMap';
import type { RootState } from '../../store';
import type { MonitorMapView } from '../types';
import type { WmsLayerConfig } from '../wms';
import type { SerializedMonitorOutlookFeature } from './monitorMapFeatureSync';
import { useMonitorMapBootstrap } from './useMonitorMapBootstrap';
import { useMonitorMapLayerSync } from './useMonitorMapLayerSync';
import { useMonitorMapRefs } from './monitorMapRefs';
import {
  clearMonitorAlertPopup,
  renderMonitorAlertPopup,
} from './renderMonitorAlertPopup';

interface UseMonitorOlMapArgs {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  serializedFeatures: SerializedMonitorOutlookFeature[];
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
  mapElementRef: RefObject<HTMLDivElement | null>;
}

/** Wires Monitor OpenLayers map bootstrap, layers, and imperative alert popups. */
export const useMonitorOlMap = (args: UseMonitorOlMapArgs) => {
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [selectedAlert, setSelectedAlert] = useState<NwsAlertDetails | null>(null);
  const refs = useMonitorMapRefs();

  const clearSelectedAlert = useCallback(() => {
    if (refs.overlayRef.current) {
      hideOverlay(refs.overlayRef.current);
    }
    setSelectedAlert(null);
    // refs omitted: wrapper object from useMonitorMapRefs() is new each render,
    // but all inner refs are stable across renders.
  }, []);

  useMonitorMapBootstrap({
    mapView: args.mapView,
    darkMode,
    radarOpacity: args.radarOpacity,
    satelliteOpacity: args.satelliteOpacity,
    alertsOpacity: args.alertsOpacity,
    mapElementRef: args.mapElementRef,
    refs,
    onSelectAlert: setSelectedAlert,
  });

  useEffect(() => {
    const container = refs.popupElRef.current;
    if (!container) {
      return undefined;
    }

    if (!selectedAlert) {
      clearMonitorAlertPopup(container);
      return undefined;
    }

    return renderMonitorAlertPopup(container, selectedAlert, clearSelectedAlert);
    // refs omitted: wrapper object from useMonitorMapRefs() is new each render.
  }, [clearSelectedAlert, selectedAlert]);

  useMonitorMapLayerSync({
    mapView: args.mapView,
    darkMode,
    radarLayer: args.radarLayer,
    radarOpacity: args.radarOpacity,
    satelliteLayer: args.satelliteLayer,
    satelliteOpacity: args.satelliteOpacity,
    serializedFeatures: args.serializedFeatures,
    stormReports: args.stormReports,
    alertsCollection: args.alertsCollection,
    alertsOpacity: args.alertsOpacity,
    refs,
    onClearSelectedAlert: clearSelectedAlert,
  });

};
