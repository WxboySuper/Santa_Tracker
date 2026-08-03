import { GATED_ROUTE_DEFINITIONS, FEATURE_SIDE_EFFECT_MODULES } from './featureSurfaces';

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
});
