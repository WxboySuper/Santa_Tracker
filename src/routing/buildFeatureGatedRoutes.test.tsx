import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import {
  assertGatedRoutesAbsent,
  mockFeatureExposureOnTarget,
  runWithBuildTarget,
  singleTargetOn,
} from '../testing/featureExposure/harness';
import { buildFeatureGatedRoutes, getExposedGatedRoutePaths } from './buildFeatureGatedRoutes';

jest.mock('../pages/gated/TropicalWorkspacePage', () => ({
  __esModule: true,
  default: () => <div>Tropical workspace page</div>,
}));

jest.mock('../pages/gated/CollaborationRoomPage', () => ({
  __esModule: true,
  default: () => <div>Collaboration room page</div>,
}));

jest.mock('../pages/gated/CustomProductsPage', () => ({
  __esModule: true,
  default: () => <div>Custom products page</div>,
}));

describe('buildFeatureGatedRoutes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registers only the beta-enabled custom products route while other gated routes remain disabled', () => {
    runWithBuildTarget('beta', () => {
      assertGatedRoutesAbsent('tropicalWorkspace', ['beta']);
      assertGatedRoutesAbsent('collaborationRoom', ['beta']);
      expect(getExposedGatedRoutePaths('beta')).toEqual(['/custom-products']);
    });
  });

  test.each(['local', 'beta'] as const)('registers custom products on the %s target', async (target) => {
    expect(getExposedGatedRoutePaths(target)).toContain('/custom-products');

    render(
      <MemoryRouter initialEntries={['/custom-products']}>
        <Routes>{buildFeatureGatedRoutes(target)}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Custom products page')).toBeInTheDocument();
  });

  test('registers exposed gated routes and lazy-loads their modules', async () => {
    const exposureSpy = mockFeatureExposureOnTarget('tropicalWorkspace', singleTargetOn('local'));

    expect(getExposedGatedRoutePaths('local')).toEqual(['/tropical', '/custom-products']);

    render(
      <MemoryRouter initialEntries={['/tropical']}>
        <Routes>{buildFeatureGatedRoutes('local')}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Tropical workspace page')).toBeInTheDocument();
    exposureSpy.mockRestore();
  });
});
