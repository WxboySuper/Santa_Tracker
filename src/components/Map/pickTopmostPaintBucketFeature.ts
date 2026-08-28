import type OLMap from 'ol/Map';
import type OLFeature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type { FeatureLike } from 'ol/Feature';
import type VectorLayer from 'ol/layer/Vector';
import { computeZIndex } from '../../utils/mapStyleUtils';
import type { EditableOutlookType } from './openLayersMapStyles';

const getFeatureStackIndex = (feature: FeatureLike): number => {
  const outlookType = feature.get('outlookType') as string | undefined;
  const probability = feature.get('probability') as string | undefined;
  if (!outlookType || !probability) {
    return -1;
  }
  return computeZIndex(outlookType as EditableOutlookType, probability);
};

/** Picks the highest-risk polygon under a pixel so overlapping edits target the top layer. */
export const pickTopmostPaintBucketFeature = (
  map: OLMap,
  pixel: number[],
  vectorLayer: VectorLayer | null,
): OLFeature<Geometry> | undefined => {
  let topFeature: OLFeature<Geometry> | undefined;
  let topIndex = -1;

  map.forEachFeatureAtPixel(
    pixel,
    (candidate, layer) => {
      if (layer !== vectorLayer) {
        return false;
      }

      const stackIndex = getFeatureStackIndex(candidate);
      if (stackIndex > topIndex) {
        topIndex = stackIndex;
        topFeature = candidate as OLFeature<Geometry>;
      }
      return false;
    },
    { hitTolerance: 3 },
  );

  return topFeature;
};
