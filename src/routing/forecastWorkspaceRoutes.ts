import type { BuildTarget } from '../config/buildTarget';
import { getBuildTarget } from '../config/buildTarget';
import { isFeatureExposedOnTarget, type FeatureKey } from '../config/featureExposure';

export type ForecastWorkspaceId = 'severe' | 'mesoscale' | 'tropical' | 'winter' | 'custom';
export type ForecastWorkspaceStatus = 'available' | 'gated' | 'future';

export interface ForecastWorkspaceRouteDefinition {
  id: ForecastWorkspaceId;
  path: `/forecast/${ForecastWorkspaceId}`;
  label: string;
  status: ForecastWorkspaceStatus;
  feature?: FeatureKey;
}

/** Canonical Forecast workspace paths. A definition may precede page registration. */
export const FORECAST_WORKSPACE_ROUTES = [
  { id: 'severe', path: '/forecast/severe', label: 'Severe', status: 'available' },
  { id: 'mesoscale', path: '/forecast/mesoscale', label: 'Mesoscale', status: 'gated', feature: 'mesoscaleWorkspace' },
  { id: 'tropical', path: '/forecast/tropical', label: 'Tropical', status: 'future', feature: 'tropicalWorkspace' },
  { id: 'winter', path: '/forecast/winter', label: 'Winter', status: 'future', feature: 'winterWorkspace' },
  { id: 'custom', path: '/forecast/custom', label: 'Custom', status: 'gated', feature: 'customProducts' },
] as const satisfies readonly ForecastWorkspaceRouteDefinition[];

export const DEFAULT_FORECAST_WORKSPACE: ForecastWorkspaceId = 'severe';

/** Returns the canonical fallback for the legacy /forecast entry point. */
export const getDefaultForecastWorkspacePath = (): '/forecast/severe' => '/forecast/severe';

/** Returns routes whose feature exposure allows registration on a target. */
export const getExposedForecastWorkspaceRoutes = (
  target: BuildTarget = getBuildTarget(),
): ForecastWorkspaceRouteDefinition[] => FORECAST_WORKSPACE_ROUTES.filter((route) => {
  if (!('feature' in route)) return true;
  return isFeatureExposedOnTarget(route.feature, target);
}) as ForecastWorkspaceRouteDefinition[];

/** Returns the workspace definition for a canonical id. */
export const getForecastWorkspaceRoute = (
  workspaceId: ForecastWorkspaceId,
): ForecastWorkspaceRouteDefinition => FORECAST_WORKSPACE_ROUTES.find(
  (route) => route.id === workspaceId,
) as ForecastWorkspaceRouteDefinition;
