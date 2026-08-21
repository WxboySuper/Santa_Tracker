import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { applyAutoCategoricalSync, selectCurrentOutlooks, selectCurrentDay, setAutoCategoricalError } from '../store/forecastSlice';
import { OutlookData } from '../types/outlooks';
import { createDerivationController } from './categoricalWorker';
import { toDerivationErrorMessage } from './categoricalErrors';

const geometryIds = new WeakMap<object, number>();
let nextGeometryId = 1;

/**
 * Returns a cheap identity token for a geometry object.
 *
 * Forecast state follows Redux's immutable-update contract. Producers must
 * replace the feature and geometry objects when coordinates change. This
 * makes object identity a valid signature input and avoids serializing every
 * polygon on each effect run.
 */
const getGeometryId = (geometry: GeoJSON.Geometry | null): number => {
  if (!geometry || typeof geometry !== 'object') return 0;
  const existingId = geometryIds.get(geometry);
  if (existingId) return existingId;
  const id = nextGeometryId++;
  geometryIds.set(geometry, id);
  return id;
};

/**
 * Builds a signature without serializing every polygon geometry.
 * Redux replaces changed features, so object identity is enough to detect an
 * edit. Sorting the small identity-token strings preserves order independence.
 */
export const signatureFromOutlookMap = (
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
      return `${sourceType}:${probability}:${getGeometryId(feature.geometry)}`;
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
const useAutoCategorical = (controllerFactory: () => ReturnType<typeof createDerivationController> = createDerivationController) => {
  const dispatch = useDispatch();
  const outlooks = useSelector(selectCurrentOutlooks);
  const currentDay = useSelector(selectCurrentDay);
  const processingRef = useRef(false);
  const lastProcessedRef = useRef<string>('');
  const latestHashRef = useRef<string>('');
  const requestIdRef = useRef(0);
  const [controller] = useState(() => controllerFactory());
  const [processingRevision, setProcessingRevision] = useState(0);

  // Process probabilistic outlooks to generate categorical outlooks
  useEffect(() => {
    // Day 4-8 don't have categorical conversion
    if (currentDay >= 4) {
      return;
    }

    const currentHash = signatureFromProbabilisticOutlooks(outlooks, currentDay);
    latestHashRef.current = currentHash;
    
    // Prevent recursive updates
    if (processingRef.current) {
      return;
    }

    // A successful derivation already handled this probabilistic state. The
    // generated categorical map changes Redux state, so checking hasChanges
    // here would start the same derivation again.
    if (currentHash === lastProcessedRef.current) {
      return;
    }

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

    // With nothing to process, record the baseline and skip derivation so an
    // empty mount does not spawn work that races with a follow-up edit.
    if (!hasChanges) {
      lastProcessedRef.current = currentHash;
      return;
    }

    processingRef.current = true;
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
          // Derivation failed. Never publish a partial result: preserve the last
          // known-good categorical geometry and surface an actionable message.
          const message = toDerivationErrorMessage(
            result.error,
            'Automatic categorical generation failed. Previous categorical geometry was preserved.'
          );
          // Do not retry the same broken geometry on every unrelated Redux
          // update. A new probabilistic edit produces a new hash and remains
          // eligible for derivation.
          lastProcessedRef.current = currentHash;
          dispatch(setAutoCategoricalError(message));
          return;
        }
        // Advance the baseline only after a successful derivation so a failure
        // or timeout can be retried on the next effect run.
        lastProcessedRef.current = currentHash;
        const categoricalMap = buildCategoricalMap(tstmFeatures, result.features);
        dispatch(applyAutoCategoricalSync({ map: categoricalMap }));
        dispatch(setAutoCategoricalError(null));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          processingRef.current = false;
          if (latestHashRef.current !== lastProcessedRef.current) {
            setProcessingRevision((revision) => revision + 1);
          }
        }
      });
  }, [controller, dispatch, outlooks, currentDay, processingRevision]);

  useEffect(() => () => controller.dispose(), [controller]);

  return null;
};

export default useAutoCategorical;
