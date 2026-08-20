import type GeoJSON from 'ol/format/GeoJSON';
import type OLFeature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type { Feature as GeoJsonFeature } from 'geojson';
import type { AppDispatch } from '../../store';
import {
  updateCustomFeature,
  updateFeaturesBatch,
} from '../../store/forecastSlice';
import {
  toUpdatedCustomFeature,
  toUpdatedGeoJsonFeature,
} from './openLayersMapStyles';

interface DispatchModifyUpdatesInput {
  features: OLFeature<Geometry>[];
  format: GeoJSON;
  isCategorical: boolean;
  dispatch: AppDispatch;
}

/** Dispatches Redux updates for one Modify interaction `modifyend` event. */
export const dispatchModifyUpdates = ({
  features,
  format,
  isCategorical,
  dispatch,
}: DispatchModifyUpdatesInput): void => {
  const updatedOutlookFeatures: GeoJsonFeature[] = [];

  for (const feature of features) {
    const customFeature = toUpdatedCustomFeature(feature, format);
    if (customFeature) {
      dispatch(updateCustomFeature(customFeature));
      continue;
    }

    const derivedFrom = feature.get('derivedFrom') as string | undefined;
    if (isCategorical && derivedFrom === 'auto-generated') {
      continue;
    }

    const updatedFeature = toUpdatedGeoJsonFeature(feature, format, isCategorical);
    if (updatedFeature) {
      updatedOutlookFeatures.push(updatedFeature);
    }
  }

  if (updatedOutlookFeatures.length === 0) {
    return;
  }

  dispatch(updateFeaturesBatch({ features: updatedOutlookFeatures }));
};
