import React, { useMemo, useRef } from 'react';
import 'ol/ol.css';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { OutlookData } from '../../types/outlooks';
import type { MonitorMapView, MonitorOutlookLayerType } from '../types';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import { flattenMonitorOutlookFeatures } from '../outlookLayers';
import type { WmsLayerConfig } from '../wms';
import { useMonitorOlMap } from './useMonitorOlMap';

interface MonitorMapProps {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  ndfdTemperatureLayer: WmsLayerConfig | null;
  ndfdTemperatureOpacity: number;
  outlookData?: OutlookData;
  outlookType: MonitorOutlookLayerType;
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
  mesoscaleDiscussions: MonitorMesoscaleDiscussionCollection;
  referenceAttributions: string[];
}

/** Monitor workspace map shell hosting radar, satellite, outlook, and alert layers. */
const MonitorMap: React.FC<MonitorMapProps> = ({
  mapView,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  ndfdTemperatureLayer,
  ndfdTemperatureOpacity,
  outlookData,
  outlookType,
  stormReports,
  alertsCollection,
  alertsOpacity,
  mesoscaleDiscussions,
  referenceAttributions,
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const serializedFeatures = useMemo(
    () => flattenMonitorOutlookFeatures(outlookData, outlookType),
    [outlookData, outlookType],
  );

  useMonitorOlMap({
    mapView,
    radarLayer,
    radarOpacity,
    satelliteLayer,
    satelliteOpacity,
    ndfdTemperatureLayer,
    ndfdTemperatureOpacity,
    serializedFeatures,
    stormReports,
    alertsCollection,
    alertsOpacity,
    mesoscaleDiscussions,
    mapElementRef,
  });

  return (
    <div className="monitor-map" aria-label="Monitor map" translate="no">
      <div ref={mapElementRef} className="monitor-map__viewport" />
      <div className="monitor-map__badge">Read-only monitor</div>
      {referenceAttributions.length > 0 ? (
        <div className="monitor-map__attribution" aria-label="Reference layer attribution">
          {referenceAttributions.join(' · ')}
        </div>
      ) : null}
    </div>
  );
};

export default MonitorMap;
