import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { BUILD_TARGETS, type BuildTarget } from '../../config/buildTarget';
import type { FeatureKey } from '../../config/featureExposure';
import { GATED_ROUTE_DEFINITIONS } from '../../config/featureSurfaces';
import {
  APP_NAVIGATION_ITEMS,
  getNavigationKeyboardShortcuts,
  getVisibleNavigationItems,
} from '../../config/featureNavigation';
import { buildFeatureGatedRoutes, getExposedGatedRoutePaths } from '../../routing/buildFeatureGatedRoutes';
import { useFeatureEffect } from '../../features/FeatureBoundary';
import {
  ALL_TARGETS_OFF,
  ALL_TARGETS_ON,
  mockFeatureExposure,
  mockFeatureExposureOnTarget,
  runWithBuildTarget,
  singleTargetOn,
} from './targetMatrix';
import type { FeatureExposureContractOptions, FeatureExposureSurfaces } from './types';

export {
  BUILD_TARGETS,
  ALL_TARGETS_OFF,
  ALL_TARGETS_ON,
  mockFeatureExposure,
  mockFeatureExposureOnTarget,
  runWithBuildTarget,
  singleTargetOn,
};

const getRoutePathsForFeature = (feature: FeatureKey): string[] =>
  GATED_ROUTE_DEFINITIONS.filter((definition) => definition.feature === feature).map(
    (definition) => `/${definition.path}`
  );

const getNavigationIdsForFeature = (feature: FeatureKey): string[] =>
  APP_NAVIGATION_ITEMS.filter((item) => item.feature === feature).map((item) => item.id);

const getNavigationShortcutKeysForFeature = (feature: FeatureKey): string[] =>
  APP_NAVIGATION_ITEMS.filter((item) => item.feature === feature)
    .map((item) => item.shortcutKey)
    .filter((shortcutKey): shortcutKey is string => Boolean(shortcutKey));

/** Asserts gated route paths are not registered for the given targets. */
export const assertGatedRoutesAbsent = (feature: FeatureKey, targets: readonly BuildTarget[]): void => {
  const expectedPaths = getRoutePathsForFeature(feature);

  for (const target of targets) {
    const exposedPaths = getExposedGatedRoutePaths(target);
    for (const path of expectedPaths) {
      expect(exposedPaths).not.toContain(path);
    }
  }
};

/** Asserts navigation items and shortcuts for a gated feature stay hidden. */
export const assertNavigationHidden = (feature: FeatureKey, targets: readonly BuildTarget[]): void => {
  const navigationIds = getNavigationIdsForFeature(feature);
  const shortcutKeys = getNavigationShortcutKeysForFeature(feature);

  for (const target of targets) {
    const visibleIds = getVisibleNavigationItems(target).map((item) => item.id);
    for (const navigationId of navigationIds) {
      expect(visibleIds).not.toContain(navigationId);
    }

    const shortcuts = getNavigationKeyboardShortcuts(jest.fn(), target);
    for (const shortcutKey of shortcutKeys) {
      expect(shortcuts[shortcutKey]).toBeUndefined();
    }
  }
};

/** Asserts a lazy route loader is not invoked while disabled. */
export const assertLazyRouteNotLoadedWhileDisabled = ({
  target,
  loadPage,
  routePath,
}: {
  feature: FeatureKey;
  target: BuildTarget;
  loadPage: jest.Mock;
  routePath: string;
}): void => {
  loadPage.mockClear();
  expect(getExposedGatedRoutePaths(target)).not.toContain(routePath);
  expect(loadPage).not.toHaveBeenCalled();
};

/** Asserts a lazy route loader is invoked and renders when enabled on a target. */
export const assertLazyRouteLoadsWhenEnabled = async ({
  feature,
  target,
  loadPage,
  routePath,
  expectedText,
}: {
  feature: FeatureKey;
  target: BuildTarget;
  loadPage: jest.Mock;
  routePath: string;
  expectedText: string;
}): Promise<void> => {
  loadPage.mockClear();
  mockFeatureExposureOnTarget(feature, singleTargetOn(target));

  render(
    <MemoryRouter initialEntries={[routePath]}>
      <Routes>{buildFeatureGatedRoutes(target)}</Routes>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(loadPage).toHaveBeenCalled();
  });
  expect(await screen.findByText(expectedText)).toBeInTheDocument();
};

/** Returns a probe component and spy for gated side effects. */
export const createSideEffectProbe = (feature: FeatureKey) => {
  const spy = jest.fn();

  const Probe = () => {
    useFeatureEffect(feature, () => {
      spy();
      return undefined;
    }, []);

    return <div>Effect probe</div>;
  };

  return { spy, Probe };
};

/** Asserts fetch was not called with a URL matching the pattern while a callback runs. */
export const assertNoFetchTo = async (
  urlPattern: RegExp | string,
  run: () => void | Promise<void>
): Promise<void> => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const callsBefore = fetchSpy.mock.calls.length;

  try {
    await run();
  } finally {
    const newCalls = fetchSpy.mock.calls.slice(callsBefore);
    for (const [request] of newCalls) {
      const url = typeof request === 'string' ? request : request?.url;
      if (typeof url === 'string') {
        const matches =
          typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
        expect(matches).toBe(false);
      }
    }
    fetchSpy.mockRestore();
  }
};

/** Installs spies that fail if timers or workers start during a callback. */
export function withNoAsyncSideEffects<T>(run: () => T): T {
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => {
    if (typeof timeout === 'number' && timeout > 0) {
      throw new Error(`Unexpected timer started with delay ${timeout}`);
    }

    if (typeof handler === 'function') {
      handler(...args);
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);

  const hadWorker = 'Worker' in global;
  const originalWorker = global.Worker;
  if (!hadWorker) {
    Object.defineProperty(global, 'Worker', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  }

  const workerSpy = jest.spyOn(global, 'Worker').mockImplementation(() => {
    throw new Error('Unexpected Worker started while feature is disabled');
  });

  try {
    return run();
  } finally {
    setTimeoutSpy.mockRestore();
    workerSpy.mockRestore();
    if (!hadWorker) {
      Reflect.deleteProperty(global, 'Worker');
    } else {
      global.Worker = originalWorker;
    }
  }
}

/** Runs disabled and optional enabled assertions across the target matrix. */
export const runFeatureExposureContract = async ({
  feature,
  surfaces,
  targets = BUILD_TARGETS,
  runDisabledAssertions,
  runEnabledAssertions,
}: FeatureExposureContractOptions): Promise<void> => {
  for (const target of targets) {
    await runDisabledAssertions({ feature, target, surfaces });
  }

  if (runEnabledAssertions) {
    for (const target of targets) {
      await runEnabledAssertions({ feature, target, surfaces });
    }
  }
};

/** Convenience wrapper that asserts standard route and navigation absence for one feature. */
export const assertStandardClientSurfacesAbsent = (
  feature: FeatureKey,
  targets: readonly BuildTarget[]
): void => {
  assertGatedRoutesAbsent(feature, targets);
  assertNavigationHidden(feature, targets);
};

/** Renders a server-backed boundary and waits for the expected absence/presence state. */
export const renderServerBackedBoundary = async ({
  boundary,
  expectedText,
  absentText,
}: {
  boundary: ReactElement;
  expectedText?: string;
  absentText?: string;
}): Promise<RenderResult> => {
  const view = render(boundary);

  if (expectedText) {
    await waitFor(() => {
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  }

  if (absentText) {
    await waitFor(() => {
      expect(screen.queryByText(absentText)).not.toBeInTheDocument();
    });
  }

  return view;
};

export type { FeatureExposureContractOptions, FeatureExposureSurfaces };
