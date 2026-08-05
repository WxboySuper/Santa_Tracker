import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { applyAutoCategoricalSync, selectCurrentOutlooks, selectCurrentDay, setAutoCategoricalError } from '../store/forecastSlice';
import { OutlookData } from '../types/outlooks';
import { toDerivationErrorMessage, processDay12OutlooksToCategorical, processDay3OutlooksToCategorical } from './autoCategoricalProcessing';
export { processDay12OutlooksToCategorical, processDay3OutlooksToCategorical, processOutlooksToCategorical, CategoricalDerivationError } from './autoCategoricalProcessing';

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
// @codescene(disable:"Complex Method", disable:"Overall Code Complexity")
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
    try {
      if (currentDay === 1 || currentDay === 2) {
        generatedFeatures = processDay12OutlooksToCategorical(outlooks);
      } else if (currentDay === 3) {
        generatedFeatures = processDay3OutlooksToCategorical(outlooks);
      }
    } catch (error) {
      // Derivation failed. Never publish a partial result: preserve the last
      // known-good categorical geometry and surface an actionable message.
      const message = toDerivationErrorMessage(
        error,
        'Automatic categorical generation failed. Previous categorical geometry was preserved.'
      );
      dispatch(setAutoCategoricalError(message));
      return;
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
      dispatch(setAutoCategoricalError(null));
    } finally {
      processingRef.current = false;
    }
  }, [dispatch, outlooks, currentDay]);

  return null;
};

export default useAutoCategorical;
