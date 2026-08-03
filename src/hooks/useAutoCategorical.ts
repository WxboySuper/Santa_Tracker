import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { applyAutoCategoricalSync, selectCurrentOutlooks, selectCurrentDay } from '../store/forecastSlice';
import { tornadoToCategorical, windToCategorical, hailToCategorical, totalSevereToCategorical } from '../utils/outlookUtils';
import { OutlookData, CIGLevel, CategoricalRiskLevel } from '../types/outlooks';
import { coerceOutlookProbabilityMap } from '../utils/outlookMapCoercion';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

/**
 * Builds a stable geometry signature for a list of features so we can detect
 * probabilistic changes without relying on generated IDs.
 */
const signatureFromFeatures = (features: GeoJSON.Feature[]): string => {
  return features
    .map((feature) => {
      const probability = String(feature.properties?.probability || '');
      return `${probability}:${JSON.stringify(feature.geometry)}`;
    })
    .sort()
    .join('|');
};

/**
 * Builds a comparable signature for the current categorical outlook map while
 * ignoring manually managed TSTM polygons.
 */
const signatureFromCategoricalMap = (categoricalMap: OutlookData['categorical']): string => {
  if (!(categoricalMap instanceof Map)) {
    return '';
  }

  const items: GeoJSON.Feature[] = [];
  categoricalMap.forEach((features, probability) => {
    if (probability === 'TSTM') {
      return;
    }

    features.forEach((feature) => {
      items.push({
        ...feature,
        properties: {
          ...feature.properties,
          probability
        }
      });
    });
  });

  return signatureFromFeatures(items);
};

/**
 * Serializes one probabilistic outlook map into a stable string that includes
 * both the source outlook type and the polygon geometry.
 */
const signatureFromOutlookMap = (
  outlookType: string,
  outlookMap?: Map<string, GeoJSON.Feature[]>
): string => {
  if (!(outlookMap instanceof Map)) {
    return '';
  }

  const items: GeoJSON.Feature[] = [];
  outlookMap.forEach((features, probability) => {
    features.forEach((feature) => {
      items.push({
        ...feature,
        properties: {
          ...feature.properties,
          outlookType,
          probability
        }
      });
    });
  });

  return items
    .map((feature) => {
      const sourceType = String(feature.properties?.outlookType || '');
      const probability = String(feature.properties?.probability || '');
      return `${sourceType}:${probability}:${JSON.stringify(feature.geometry)}`;
    })
    .sort()
    .join('|');
};

/**
 * Builds a day-aware signature of the probabilistic outlooks that drive
 * automatic categorical generation.
 */
const signatureFromProbabilisticOutlooks = (outlooks: OutlookData, currentDay: number): string => {
  if (currentDay === 1 || currentDay === 2) {
    return [
      signatureFromOutlookMap('tornado', outlooks.tornado),
      signatureFromOutlookMap('wind', outlooks.wind),
      signatureFromOutlookMap('hail', outlooks.hail),
    ].join('|');
  }

  if (currentDay === 3) {
    return signatureFromOutlookMap('totalSevere', outlooks.totalSevere);
  }

  return '';
};

/**
 * Rebuilds the categorical map from generated features while preserving any
 * existing manual TSTM geometry.
 */
const buildCategoricalMap = (
  tstmFeatures: GeoJSON.Feature[],
  generatedFeatures: GeoJSON.Feature[]
): Map<string, GeoJSON.Feature[]> => {
  const categoricalMap = new Map<string, GeoJSON.Feature[]>();

  if (tstmFeatures.length > 0) {
    categoricalMap.set('TSTM', tstmFeatures);
  }

  generatedFeatures.forEach((feature) => {
    const probability = String(feature.properties?.probability || '');
    const existingFeatures = categoricalMap.get(probability) || [];
    categoricalMap.set(probability, [...existingFeatures, feature]);
  });

  return categoricalMap;
};

/**
 * Hook that automatically generates categorical outlooks based on probabilistic outlooks.
 * Note: General Thunderstorm (TSTM) areas must be drawn manually in categorical mode.
 * 
 * Day 1/2: Converts tornado, wind, hail probabilities to categorical
 * Day 3: Converts totalSevere probabilities to categorical
 * Day 4-8: Does nothing (no categorical conversion)
 */
const useAutoCategorical = () => {
  const dispatch = useDispatch();
  const outlooks = useSelector(selectCurrentOutlooks);
  const currentDay = useSelector(selectCurrentDay);
  const processingRef = useRef(false);
  const lastProcessedRef = useRef<string>('');

  // Process probabilistic outlooks to generate categorical outlooks
  useEffect(() => {
    // Day 4-8 don't have categorical conversion
    if (currentDay >= 4) {
      return;
    }
    
    // Prevent recursive updates
    if (processingRef.current) {
      return;
    }

    const currentHash = signatureFromProbabilisticOutlooks(outlooks, currentDay);

    // Skip if there are no changes to process
    let hasChanges = false;
    if (currentDay === 1 || currentDay === 2) {
      hasChanges = ['tornado', 'wind', 'hail'].some(type => {
        const map = outlooks[type as keyof typeof outlooks];
        return map instanceof Map && map.size > 0;
      });
    } else if (currentDay === 3) {
      hasChanges = outlooks.totalSevere instanceof Map ? outlooks.totalSevere.size > 0 : false;
    }
    
    // Build the categorical geometry that *should* exist for current probabilistic data
    // and compare to what is currently present. This catches imported stale/ring
    // categorical geometry even when probabilistic IDs/hash are unchanged.
    let generatedFeatures: GeoJSON.Feature[] = [];
    if (currentDay === 1 || currentDay === 2) {
      generatedFeatures = processDay12OutlooksToCategorical(outlooks);
    } else if (currentDay === 3) {
      generatedFeatures = processDay3OutlooksToCategorical(outlooks);
    }

    const expectedSignature = signatureFromFeatures(generatedFeatures);
    const currentSignature = signatureFromCategoricalMap(outlooks.categorical);
    const categoricalOutOfSync = expectedSignature !== currentSignature;

    if (!hasChanges) {
      lastProcessedRef.current = currentHash;
      if (!categoricalOutOfSync) {
        return;
      }
    }

    // Fast path: same probabilistic state and categorical already matches expected output.
    if (currentHash === lastProcessedRef.current && !categoricalOutOfSync) {
      return;
    }

    processingRef.current = true;
    lastProcessedRef.current = currentHash;

    try {
      // Store existing TSTM areas before clearing categoricals
      const tstmFeatures = (outlooks.categorical instanceof Map) ? (outlooks.categorical.get('TSTM') || []) : [];
      const categoricalMap = buildCategoricalMap(tstmFeatures, generatedFeatures);

      dispatch(applyAutoCategoricalSync({ map: categoricalMap }));
    } finally {
      processingRef.current = false;
    }
  }, [dispatch, outlooks, currentDay]);

  return null;
};

/**
 * Entry point for tests and manual processing.
 * Converts probabilistic outlooks to categorical features.
 */
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
  if (type === 'tornado') risk = tornadoToCategorical(prob, cig);
  if (type === 'wind') risk = windToCategorical(prob, cig);
  if (type === 'hail') risk = hailToCategorical(prob, cig);

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
      appendRiskPolygon(riskPolygons, totalSevereToCategorical(probStr, cig), piece);
    },
  );

  return buildCumulativeCategoricalFeatures(riskPolygons);
}

export default useAutoCategorical;
