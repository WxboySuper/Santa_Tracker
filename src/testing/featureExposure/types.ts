import type { BuildTarget } from '../../config/buildTarget';
import type { FeatureExposureMatrix, FeatureKey } from '../../config/featureExposure';

export type FeatureExposureSurfaces = {
  /** Gated route path segments (without leading slash) owned by this feature. */
  routePaths?: readonly string[];
  /** Navigation item ids that should hide when the feature is disabled. */
  navigationIds?: readonly string[];
  /** Navigation shortcut keys that should be absent when the feature is disabled. */
  navigationShortcutKeys?: readonly string[];
  /** Side-effect module paths documented in featureSurfaces. */
  sideEffectModules?: readonly string[];
  /** Server capability key when the feature is server-backed. */
  serverCapabilityKey?: string;
};

export type FeatureExposureContractOptions = {
  feature: FeatureKey;
  surfaces: FeatureExposureSurfaces;
  targets?: readonly BuildTarget[];
  runDisabledAssertions: (context: {
    feature: FeatureKey;
    target: BuildTarget;
    surfaces: FeatureExposureSurfaces;
  }) => void | Promise<void>;
  runEnabledAssertions?: (context: {
    feature: FeatureKey;
    target: BuildTarget;
    surfaces: FeatureExposureSurfaces;
  }) => void | Promise<void>;
};

export type { BuildTarget, FeatureExposureMatrix, FeatureKey };
