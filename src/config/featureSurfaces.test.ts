import { GATED_ROUTE_DEFINITIONS, FEATURE_SIDE_EFFECT_MODULES } from './featureSurfaces';
import { FEATURE_EXPOSURE_REGISTRY } from './featureExposure';

describe('featureSurfaces', () => {
  test('declares lazy route loaders for gated workspace features', () => {
    expect(GATED_ROUTE_DEFINITIONS.map((definition) => definition.path)).toEqual([
      'tropical',
      'collaborate',
      'custom-products',
    ]);
  });

  test('documents side-effect modules that must stay behind feature boundaries', () => {
    expect(FEATURE_SIDE_EFFECT_MODULES.autoTstm).toEqual(['../utils/tstmGeneration']);
    expect(FEATURE_SIDE_EFFECT_MODULES.customProducts).toEqual(['../lib/customProductsRepository']);
  });

  test('keeps unfinished workspace exposure disabled', () => {
    expect(FEATURE_EXPOSURE_REGISTRY.mesoscaleWorkspace.exposure).toEqual({
      local: false, beta: false, staging: false, production: false,
    });
    expect(FEATURE_EXPOSURE_REGISTRY.winterWorkspace.exposure).toEqual({
      local: false, beta: false, staging: false, production: false,
    });
  });
});
