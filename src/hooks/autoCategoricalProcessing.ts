import * as turf from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { tornadoToCategorical, windToCategorical, hailToCategorical, totalSevereToCategorical } from '../utils/outlookUtils';
import { OutlookData, CIGLevel, CategoricalRiskLevel } from '../types/outlooks';
import { coerceOutlookProbabilityMap } from '../utils/outlookMapCoercion';

export function processOutlooksToCategorical(outlooks: OutlookData, day: number = 1): GeoJSON.Feature[] {
  if (day === 1 || day === 2) {
    return processDay12OutlooksToCategorical(outlooks);
  } else if (day === 3) {
    return processDay3OutlooksToCategorical(outlooks);
  }
  return [];
}

type PolygonOutlookFeature = Feature<Polygon | MultiPolygon>;

/** Builds a reusable two-feature collection shell for Turf v7 boolean ops. */
const createPairFeatureCollection = (): FeatureCollection<Polygon | MultiPolygon> => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
  ],
});

/** Assigns two polygon features into a reusable collection before Turf calls. */
const setPairFeatures = (
  collection: FeatureCollection<Polygon | MultiPolygon>,
  first: PolygonOutlookFeature,
  second: PolygonOutlookFeature,
): void => {
  collection.features[0] = first;
  collection.features[1] = second;
};

const pairFeatureCollection = createPairFeatureCollection();

// Helper to safely union a list of polygons
const safeUnion = (features: Feature<Polygon | MultiPolygon>[]): Feature<Polygon | MultiPolygon> | null => {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];
  
  try {
    // Turf v7: union takes a FeatureCollection
    let fc: FeatureCollection<Polygon | MultiPolygon>;
    if (features.length === 2) {
      setPairFeatures(pairFeatureCollection, features[0], features[1]);
      fc = pairFeatureCollection;
    } else {
      fc = turf.featureCollection(features);
    }
    const result = turf.union(fc);
    return result as Feature<Polygon | MultiPolygon>;
  } catch {
    return features[0]; // Fallback on Turf union error
  }
};

/**
 * Unions the collected risk polygons into cumulative categorical rings so each
 * lower tier includes all higher-risk geometry beneath it.
 */
const buildCumulativeCategoricalFeatures = (
  riskPolygons: Map<CategoricalRiskLevel, Feature<Polygon | MultiPolygon>[]>
): GeoJSON.Feature[] => {
  const generatedFeatures: GeoJSON.Feature[] = [];
  const riskOrderHighToLow: CategoricalRiskLevel[] = ['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL'];
  const cumulativeByRisk = new Map<CategoricalRiskLevel, Feature<Polygon | MultiPolygon>>();

  let higherAccumulated: Feature<Polygon | MultiPolygon> | null = null;

  // Build cumulative geometry from highest -> lowest.
  // Each lower risk includes its own geometry plus all higher-risk geometry.
  riskOrderHighToLow.forEach((risk) => {
    const polys = riskPolygons.get(risk) || [];
    let current = safeUnion(polys);

    if (!current && !higherAccumulated) {
      return;
    }

    if (!current && higherAccumulated) {
      current = higherAccumulated;
    } else if (current && higherAccumulated) {
      current = safeUnion([current, higherAccumulated]) || current;
    }

    if (current) {
      cumulativeByRisk.set(risk, current);
      higherAccumulated = current;
    }
  });

  // Emit in draw order from lowest -> highest.
  (['MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as CategoricalRiskLevel[]).forEach((risk) => {
    const geom = cumulativeByRisk.get(risk);
    if (!geom) {
      return;
    }

    generatedFeatures.push({
      ...geom,
      id: uuidv4(),
      properties: {
        outlookType: 'categorical',
        probability: risk,
        derivedFrom: 'auto-generated'
      }
    });
  });

  return generatedFeatures;
};

/** Narrows GeoJSON features to polygon geometries used in categorical generation. */
const isPolygonOutlookFeature = (feature: GeoJSON.Feature): feature is PolygonOutlookFeature =>
  feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';

/** Separates probability keys from CIG hatching keys inside one outlook probability map. */
const partitionProbabilityMap = (probMap: Map<string, GeoJSON.Feature[]>) => {
  const probabilityFeatures = new Map<string, PolygonOutlookFeature[]>();
  const hatchingFeatures = new Map<CIGLevel, PolygonOutlookFeature[]>();

  probMap.forEach((features, key) => {
    const validFeatures = features.filter(isPolygonOutlookFeature);
    if (validFeatures.length === 0) {
      return;
    }

    if (key.startsWith('CIG')) {
      hatchingFeatures.set(key as CIGLevel, validFeatures);
    } else {
      probabilityFeatures.set(key, validFeatures);
    }
  });

  return { probabilityFeatures, hatchingFeatures };
};

/** Unions hatching polygons per CIG level for intersection against probability areas. */
const buildHatchingRegions = (
  hatchingFeatures: Map<CIGLevel, PolygonOutlookFeature[]>,
  cigLevels: CIGLevel[],
): Map<CIGLevel, PolygonOutlookFeature> => {
  const hatchingRegions = new Map<CIGLevel, PolygonOutlookFeature>();

  cigLevels.forEach((cig) => {
    const features = hatchingFeatures.get(cig);
    if (features) {
      const unioned = safeUnion(features);
      if (unioned) {
        hatchingRegions.set(cig, unioned);
      }
    }
  });

  return hatchingRegions;
};

/** Splits each probability polygon by hatching layers and emits categorical pieces via callback. */
const applyProbabilityFeaturesWithHatching = (
  probabilityFeatures: Map<string, PolygonOutlookFeature[]>,
  hatchingRegions: Map<CIGLevel, PolygonOutlookFeature>,
  cigLevels: CIGLevel[],
  onPiece: (probStr: string, cig: CIGLevel, piece: PolygonOutlookFeature) => void,
): void => {
  probabilityFeatures.forEach((features, probStr) => {
    features.forEach((poly) => {
      let remainingPoly: PolygonOutlookFeature | null = poly;
      const pairCollection = createPairFeatureCollection();

      cigLevels.forEach((cig) => {
        if (!remainingPoly) {
          return;
        }

        const hatchRegion = hatchingRegions.get(cig);
        if (!hatchRegion) {
          return;
        }

        try {
          setPairFeatures(pairCollection, remainingPoly, hatchRegion);
          const intersection = turf.intersect(pairCollection);
          if (intersection) {
            onPiece(probStr, cig, intersection as PolygonOutlookFeature);
            setPairFeatures(pairCollection, remainingPoly, intersection as PolygonOutlookFeature);
            remainingPoly = turf.difference(pairCollection) as PolygonOutlookFeature | null;
          }
        } catch {
          // Ignore topology errors
        }
      });

      if (remainingPoly) {
        onPiece(probStr, 'CIG0', remainingPoly);
      }
    });
  });
};

/** Appends one categorical risk polygon unless the mapped risk is manual TSTM. */
const appendRiskPolygon = (
  riskMap: Map<CategoricalRiskLevel, PolygonOutlookFeature[]>,
  risk: CategoricalRiskLevel,
  poly: PolygonOutlookFeature,
): void => {
  if (risk === 'TSTM') {
    return;
  }

  const current = riskMap.get(risk) || [];
  current.push(poly);
  riskMap.set(risk, current);
};

// Helper to convert Day 1/2 probability features to categorical pieces
export function processDay12OutlooksToCategorical(outlooks: OutlookData): GeoJSON.Feature[] {
  const riskPolygons = new Map<CategoricalRiskLevel, PolygonOutlookFeature[]>();
  const types = ['tornado', 'wind', 'hail'] as const;
  const cigLevels: CIGLevel[] = ['CIG3', 'CIG2', 'CIG1'];

  types.forEach((type) => {
    const probMap = coerceOutlookProbabilityMap(outlooks[type]);
    if (!probMap || probMap.size === 0) {
      return;
    }

    const { probabilityFeatures, hatchingFeatures } = partitionProbabilityMap(probMap);
    const hatchingRegions = buildHatchingRegions(hatchingFeatures, cigLevels);

    applyProbabilityFeaturesWithHatching(
      probabilityFeatures,
      hatchingRegions,
      cigLevels,
      (probStr, cig, piece) => addPieceToRiskMap(type, probStr, cig, piece, riskPolygons),
    );
  });

  return buildCumulativeCategoricalFeatures(riskPolygons);
}

/**
 * Maps one intersected probabilistic polygon piece into its categorical risk
 * bucket and appends it unless it resolves to TSTM.
 */
function addPieceToRiskMap(
  type: 'tornado' | 'wind' | 'hail',
  prob: string,
  cig: CIGLevel,
  poly: PolygonOutlookFeature,
  riskMap: Map<CategoricalRiskLevel, PolygonOutlookFeature[]>,
) {
  let risk: CategoricalRiskLevel = 'TSTM';
  if (type === 'tornado') risk = tornadoToCategorical({ probability: prob, cig });
  if (type === 'wind') risk = windToCategorical({ probability: prob, cig });
  if (type === 'hail') risk = hailToCategorical({ probability: prob, cig });

  appendRiskPolygon(riskMap, risk, poly);
}

// Helper to convert Day 3 Total Severe probability features to categorical pieces
export function processDay3OutlooksToCategorical(outlooks: OutlookData): GeoJSON.Feature[] {
  const riskPolygons = new Map<CategoricalRiskLevel, PolygonOutlookFeature[]>();
  const probMap = coerceOutlookProbabilityMap(outlooks.totalSevere);
  if (!probMap || probMap.size === 0) {
    return [];
  }

  const cigLevels: CIGLevel[] = ['CIG2', 'CIG1'];
  const { probabilityFeatures, hatchingFeatures } = partitionProbabilityMap(probMap);
  const hatchingRegions = buildHatchingRegions(hatchingFeatures, cigLevels);

  applyProbabilityFeaturesWithHatching(
    probabilityFeatures,
    hatchingRegions,
    cigLevels,
    (probStr, cig, piece) => {
      appendRiskPolygon(riskPolygons, totalSevereToCategorical({ probability: probStr, cig }), piece);
    },
  );

  return buildCumulativeCategoricalFeatures(riskPolygons);
}

