import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { applyAutoCategoricalSync, selectCurrentOutlooks, selectCurrentDay } from '../store/forecastSlice';
import { OutlookData } from '../types/outlooks';
import { createDerivationController } from './categoricalWorker';
export { processDay12OutlooksToCategorical, processDay3OutlooksToCategorical, processOutlooksToCategorical } from './autoCategoricalProcessing';

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
  const requestIdRef = useRef(0);
  const [controller] = useState(() => createDerivationController());

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

    // Fast path: same probabilistic state and no changes worth processing.
    if (currentHash === lastProcessedRef.current && !hasChanges) {
      return;
    }

    // With nothing to process, record the baseline and skip derivation so an
    // empty mount does not spawn work that races with a follow-up edit.
    if (!hasChanges) {
      lastProcessedRef.current = currentHash;
      return;
    }

    processingRef.current = true;
    lastProcessedRef.current = currentHash;
    const requestId = ++requestIdRef.current;

    // Store existing TSTM areas before clearing categoricals
    const tstmFeatures = (outlooks.categorical instanceof Map) ? (outlooks.categorical.get('TSTM') || []) : [];

    controller.derive(requestId, currentDay, outlooks)
      .then((result) => {
        // Discard stale responses: only the newest request may commit.
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (!result.ok || !result.features) {
          return;
        }
        const categoricalMap = buildCategoricalMap(tstmFeatures, result.features);
        dispatch(applyAutoCategoricalSync({ map: categoricalMap }));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          processingRef.current = false;
        }
      });
  }, [controller, dispatch, outlooks, currentDay]);

  useEffect(() => () => controller.dispose(), [controller]);

  return null;
};

export default useAutoCategorical;
