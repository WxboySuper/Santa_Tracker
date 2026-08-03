import type { ReactNode } from 'react';
import { getFeatureExposure, isFeatureExposed, type FeatureKey } from '../config/featureExposure';
import {
  useServerBackedFeatureRuntimeState,
  useServerCapabilityAvailable,
} from '../config/serverCapabilityStatus';
import { FeatureBoundary } from './FeatureBoundary';

type ServerBackedFeatureBoundaryProps = {
  feature: FeatureKey;
  children: ReactNode;
  unavailableMessage?: string;
};

const DEFAULT_UNAVAILABLE_MESSAGE =
  'This capability is temporarily unavailable on this deployment. Please check back later.';

/** Renders a non-sensitive fallback when a server-backed feature is unavailable at runtime. */
export const ServerBackedFeatureUnavailable = ({
  message = DEFAULT_UNAVAILABLE_MESSAGE,
}: {
  message?: string;
}) => (
  <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
    {message}
  </div>
);

/** Returns whether a server-backed feature is available at runtime on this deployment. */
export const useServerBackedFeatureAvailable = (feature: FeatureKey): boolean => {
  const compileTimeExposed = isFeatureExposed(feature);
  const serverAvailable = useServerCapabilityAvailable(feature);

  if (!compileTimeExposed) {
    return false;
  }

  const definition = getFeatureExposure(feature);
  if (!definition.serverBacked) {
    return true;
  }

  return serverAvailable;
};

/** Applies runtime server availability checks inside a compile-time feature boundary. */
const ServerBackedFeatureRuntimeBoundary = ({
  feature,
  children,
  unavailableMessage,
}: ServerBackedFeatureBoundaryProps) => {
  const runtimeState = useServerBackedFeatureRuntimeState(feature);
  const definition = getFeatureExposure(feature);

  if (!definition.serverBacked) {
    return children;
  }

  if (runtimeState === 'loading') {
    return null;
  }

  if (runtimeState === 'unavailable') {
    return <ServerBackedFeatureUnavailable message={unavailableMessage} />;
  }

  return children;
};

/** Mounts children only when compile-time exposure and runtime server availability both allow it. */
export const ServerBackedFeatureBoundary = ({
  feature,
  children,
  unavailableMessage,
}: ServerBackedFeatureBoundaryProps) => (
  <FeatureBoundary feature={feature}>
    <ServerBackedFeatureRuntimeBoundary
      feature={feature}
      unavailableMessage={unavailableMessage}
    >
      {children}
    </ServerBackedFeatureRuntimeBoundary>
  </FeatureBoundary>
);
