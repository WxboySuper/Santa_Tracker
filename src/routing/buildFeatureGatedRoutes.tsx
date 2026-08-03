import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react';
import { Route } from 'react-router-dom';
import type { BuildTarget } from '../config/buildTarget';
import { getBuildTarget } from '../config/buildTarget';
import { isFeatureExposedOnTarget } from '../config/featureExposure';
import { GATED_ROUTE_DEFINITIONS, type GatedRouteDefinition } from '../config/featureSurfaces';

const lazyPageCache = new Map<string, LazyExoticComponent<ComponentType>>();

/** Returns a cached lazy component for one gated route definition. */
const getLazyPage = (definition: GatedRouteDefinition): LazyExoticComponent<ComponentType> => {
  const cached = lazyPageCache.get(definition.path);
  if (cached) {
    return cached;
  }

  const lazyPage = lazy(definition.loadPage);
  lazyPageCache.set(definition.path, lazyPage);
  return lazyPage;
};

/** Returns gated route pathnames that would register for the given deployment target. */
export const getExposedGatedRoutePaths = (target: BuildTarget = getBuildTarget()): string[] =>
  GATED_ROUTE_DEFINITIONS.filter((definition) => isFeatureExposedOnTarget(definition.feature, target)).map(
    (definition) => `/${definition.path}`
  );

/** Minimal loading placeholder shown while a gated lazy route chunk downloads. */
const GatedRouteFallback = () => (
  <div className="flex h-full items-center justify-center p-6" aria-busy="true" aria-label="Loading page" />
);

/** Registers lazy routes only for features exposed on the current build target. */
export const buildFeatureGatedRoutes = (target: BuildTarget = getBuildTarget()): ReactElement[] =>
  GATED_ROUTE_DEFINITIONS.filter((definition) => isFeatureExposedOnTarget(definition.feature, target)).map(
    (definition) => {
      const Page = getLazyPage(definition);

      return (
        <Route
          key={definition.path}
          path={definition.path}
          element={
            <Suspense fallback={<GatedRouteFallback />}>
              <Page />
            </Suspense>
          }
        />
      );
    }
  );
