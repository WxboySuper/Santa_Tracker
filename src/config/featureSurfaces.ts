import type { ComponentType } from 'react';
import type { FeatureKey } from './featureExposure';

export type GatedRouteDefinition = {
  feature: FeatureKey;
  path: string;
  loadPage: () => Promise<{ default: ComponentType }>;
};

/** Declares lazy routes owned by registry features. Core app routes stay outside this list. */
export const GATED_ROUTE_DEFINITIONS = [
  {
    feature: 'tropicalWorkspace',
    path: 'tropical',
    loadPage: () => import('../pages/gated/TropicalWorkspacePage'),
  },
  {
    feature: 'collaborationRoom',
    path: 'collaborate',
    loadPage: () => import('../pages/gated/CollaborationRoomPage'),
  },
  {
    feature: 'customProducts',
    path: 'custom-products',
    loadPage: () => import('../pages/gated/CustomProductsPage'),
  },
] as const satisfies readonly GatedRouteDefinition[];

/** Documents modules that must only initialize behind a feature boundary. */
export const FEATURE_SIDE_EFFECT_MODULES = {
  autoTstm: ['../utils/tstmGeneration'],
  customProducts: ['../lib/customProductsRepository'],
  verificationRelaunch: [
    '../components/ForecastGrade/ForecastGradeDashboard',
    '../utils/verificationV2',
  ],
} as const satisfies Partial<Record<FeatureKey, readonly string[]>>;
