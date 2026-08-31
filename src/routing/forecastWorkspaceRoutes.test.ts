import {
  DEFAULT_FORECAST_WORKSPACE,
  FORECAST_WORKSPACE_ROUTES,
  getDefaultForecastWorkspacePath,
  getExposedForecastWorkspaceRoutes,
  getForecastWorkspaceRoute,
} from './forecastWorkspaceRoutes';

describe('forecast workspace route contract', () => {
  test('declares the v1.8 workspace paths in product order', () => {
    expect(FORECAST_WORKSPACE_ROUTES.map((route) => route.path)).toEqual([
      '/forecast/severe', '/forecast/mesoscale', '/forecast/tropical', '/forecast/winter', '/forecast/custom',
    ]);
    expect(DEFAULT_FORECAST_WORKSPACE).toBe('severe');
    expect(getDefaultForecastWorkspacePath()).toBe('/forecast/severe');
  });

  test('keeps unfinished workspaces out of the production route set', () => {
    expect(getExposedForecastWorkspaceRoutes('production').map((route) => route.id)).toEqual(['severe', 'custom']);
  });

  test('exposes Custom according to its existing product feature gate', () => {
    expect(getExposedForecastWorkspaceRoutes('beta').map((route) => route.id)).toEqual(['severe', 'custom']);
  });

  test('keeps workspace lookup independent of page registration', () => {
    expect(getForecastWorkspaceRoute('mesoscale')).toMatchObject({
      path: '/forecast/mesoscale', status: 'gated', feature: 'mesoscaleWorkspace',
    });
  });
});
