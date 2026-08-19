import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import type { FeatureLike } from 'ol/Feature';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import { buildStormReportStyle } from '../stormReportMapStyle';
import { toOlStyle } from '../../components/Map/openLayersMapStyles';
import { MONITOR_OUTLOOK_TRANSPARENCY_SCALE } from './monitorMapLayerUtils';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';

export interface SerializedMonitorOutlookFeature {
  outlookType: string;
  probability: string;
  feature: object;
}

// These caches are valid because each source is exclusively reconciled by its
// corresponding sync function; callers must use a new input reference after
// mutating or externally clearing a source.
const lastOutlookInput = new WeakMap<VectorSource, SerializedMonitorOutlookFeature[]>();
const lastAlertInput = new WeakMap<VectorSource, NwsAlertFeatureCollection>();
const lastReportInput = new WeakMap<VectorSource, StormReport[]>();
const lastMesoscaleInput = new WeakMap<VectorSource, MonitorMesoscaleDiscussionCollection>();

/** Replaces the monitor outlook vector source with serialized outlook features. */
export const syncOutlookFeatures = (
  source: VectorSource,
  serializedFeatures: SerializedMonitorOutlookFeature[],
) => {
  if (lastOutlookInput.get(source) === serializedFeatures) return;
  lastOutlookInput.set(source, serializedFeatures);
  source.clear();
  const format = new GeoJSON();

  serializedFeatures.forEach(({ outlookType, probability, feature }) => {
    const olFeature = format.readFeature(feature, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    // Applies monitor outlook styling before adding a feature to the source.
    const applyStyle = (item: FeatureLike) => {
      if ('setStyle' in item && typeof item.setStyle === 'function') {
        item.setStyle(toOlStyle(
          { outlookType, probability },
          { transparencyScale: MONITOR_OUTLOOK_TRANSPARENCY_SCALE },
        ));
      }
      source.addFeature(item as never);
    };

    if (Array.isArray(olFeature)) {
      olFeature.forEach(applyStyle);
    } else {
      applyStyle(olFeature as FeatureLike);
    }
  });
};

/** Replaces the monitor alert vector source with NWS alert polygons. */
export const syncAlertFeatures = (
  source: VectorSource,
  alertsCollection: NwsAlertFeatureCollection,
) => {
  if (lastAlertInput.get(source) === alertsCollection) return;
  lastAlertInput.set(source, alertsCollection);
  source.clear();
  const format = new GeoJSON();

  alertsCollection.features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }

    const olFeatures = format.readFeatures(feature, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    olFeatures.forEach((olFeature) => {
      if ('setProperties' in olFeature && typeof olFeature.setProperties === 'function') {
        olFeature.setProperties({
          ...(feature.properties ?? {}),
          event: feature.properties?.event ?? 'Alert',
          nwsAlert: true,
        });
      }
      source.addFeature(olFeature as never);
    });
  });
};

/** Replaces the monitor storm report source with point features. */
export const syncStormReportFeatures = (source: VectorSource, stormReports: StormReport[]) => {
  if (lastReportInput.get(source) === stormReports) return;
  lastReportInput.set(source, stormReports);
  source.clear();

  stormReports.forEach((report) => {
    const feature = new Feature({
      geometry: new Point(fromLonLat([report.longitude, report.latitude])),
      reportId: report.id,
      type: report.type,
    });
    feature.setStyle(buildStormReportStyle(report.type));
    source.addFeature(feature);
  });
};

/** Replaces the SPC mesoscale discussion source with normalized polygon features. */
export const syncMesoscaleDiscussionFeatures = (
  source: VectorSource,
  collection: MonitorMesoscaleDiscussionCollection,
) => {
  if (lastMesoscaleInput.get(source) === collection) return;
  lastMesoscaleInput.set(source, collection);
  source.clear();
  const format = new GeoJSON();

  collection.features.forEach((feature) => {
    const olFeatures = format.readFeatures(feature, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    olFeatures.forEach((olFeature) => {
      if ('setProperties' in olFeature && typeof olFeature.setProperties === 'function') {
        olFeature.setProperties({
          ...(feature.properties ?? {}),
          monitorReferenceLayer: 'spc-mesoscale-discussion',
        });
      }
      source.addFeature(olFeature as never);
    });
  });
};
