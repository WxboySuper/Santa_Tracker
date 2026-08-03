import { useEffect, type DependencyList, type EffectCallback, type ReactNode } from 'react';
import { isFeatureExposed, type FeatureKey } from '../config/featureExposure';

type FeatureBoundaryProps = {
  feature: FeatureKey;
  children: ReactNode;
};

/** Renders children only when the feature is exposed on the current build target. */
export const FeatureBoundary = ({ feature, children }: FeatureBoundaryProps) => {
  if (!isFeatureExposed(feature)) {
    return null;
  }

  return children;
};

/** Returns whether a registry feature is exposed on the current build target. */
export const useFeatureExposed = (feature: FeatureKey): boolean => isFeatureExposed(feature);

/** Runs an effect only while the feature is exposed on the current build target. */
export const useFeatureEffect = (
  feature: FeatureKey,
  effect: EffectCallback,
  deps: DependencyList
): void => {
  const exposed = isFeatureExposed(feature);

  useEffect(() => {
    if (!exposed) {
      return undefined;
    }

    return effect();
    // Feature exposure is compile-time stable per build; deps carry caller state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposed, feature, ...deps]);
};
