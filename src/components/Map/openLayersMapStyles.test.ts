/**
 * Focused tests for the extracted OpenLayers map styling/geometry seam.
 * These helpers were moved out of OpenLayersForecastMap.tsx so map styling
 * concerns can be reviewed and tested without loading the React component.
 */
import { jest } from '@jest/globals';

jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

jest.mock('../../utils/mapStyleUtils', () => ({
  getFeatureStyle: jest.fn(() => ({
    fillColor: '#112233',
    fillOpacity: 0.5,
    opacity: 0.9,
    color: '#445566',
    weight: 4,
  })),
  computeZIndex: jest.fn(() => 42),
}));

import {
  toRgbaColor,
  resolveFillOpacity,
  resolveStrokeWidth,
  getFeatureIdentity,
  applyBlankLayerStyle,
  isDrawableOutlookType,
  toOlStyle,
  createCustomFill,
  toCustomOlStyle,
  getCustomFeatureIdentity,
  toTstmPreviewOlStyle,
  toGhostOlStyle,
  createLabelOverlaySource,
  createTileSource,
  hideOverlay,
} from './openLayersMapStyles';

type FeatureStub = {
  get: (key: string) => unknown;
  getGeometry: () => object | null;
  setStyle?: (style: unknown) => void;
};

describe('openLayersMapStyles', () => {
  test('toRgbaColor normalizes hex, rgb, and empty inputs', () => {
    expect(toRgbaColor({ color: '', alpha: 0.5 })).toBe('rgba(255, 255, 255, 0.5)');
    expect(toRgbaColor({ color: '#abc', alpha: 0.3 })).toBe('rgba(170, 187, 204, 0.3)');
    expect(toRgbaColor({ color: '#112233', alpha: 1 })).toBe('rgba(17, 34, 51, 1)');
    expect(toRgbaColor({ color: 'rgba(1,2,3,0.4)', alpha: 0.9 })).toBe('rgba(1,2,3,0.4)');
  });

  test('resolveFillOpacity defaults to 0.25 and resolveStrokeWidth honors the top layer', () => {
    expect(resolveFillOpacity({ fillOpacity: undefined })).toBe(0.25);
    expect(resolveFillOpacity({ fillOpacity: 0.7 })).toBe(0.7);
    expect(resolveStrokeWidth({ weight: 5, isTopLayer: true })).toBe(3);
    expect(resolveStrokeWidth({ weight: 5, isTopLayer: false })).toBe(5);
    expect(resolveStrokeWidth({ weight: undefined, isTopLayer: false })).toBe(2);
  });

  test('getFeatureIdentity returns null when any property is missing', () => {
    const feature = { get: (key: string) => (key === 'featureId' ? 'f1' : undefined), getGeometry: () => null };
    expect(getFeatureIdentity(feature as never)).toBeNull();
  });

  test('isDrawableOutlookType restricts to editable types', () => {
    expect(isDrawableOutlookType({ outlookType: 'tornado' })).toBe(true);
    expect(isDrawableOutlookType({ outlookType: 'rain' })).toBe(false);
  });

  test('applyBlankLayerStyle guards features without setStyle', () => {
    const styled: FeatureStub = { get: () => undefined, getGeometry: () => null, setStyle: jest.fn() };
    const plain: FeatureStub = { get: () => undefined, getGeometry: () => null };
    applyBlankLayerStyle([styled as never, plain as never], {} as never);
    expect((styled.setStyle as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  test('toOlStyle produces a style for a numeric outlook', () => {
    const style = toOlStyle({ outlookType: 'tornado', probability: '30%' });
    expect(style).toBeTruthy();
  });

  test('toCustomOlStyle and createCustomFill work for plain fills', () => {
    const category = {
      id: 'cat-1',
      label: 'Critical',
      order: 0,
      style: { fillColor: '#ef4444', fillOpacity: 0.6, strokeColor: '#123456', strokeOpacity: 0.8, strokeWidth: 2, hatch: 'none' as const },
    };
    expect(createCustomFill(category.style)).toBeTruthy();
    expect(toCustomOlStyle(category as never)).toBeTruthy();
  });

  test('getCustomFeatureIdentity extracts custom identity', () => {
    const values: Record<string, unknown> = { featureId: 'f1', customLayerId: 'l1', categoryId: 'c1', title: 'T' };
    const feature = { get: (key: string) => values[key], getGeometry: () => null };
    expect(getCustomFeatureIdentity(feature as never)).toEqual({ featureId: 'f1', customLayerId: 'l1', categoryId: 'c1', title: 'T' });
  });

  test('toTstmPreviewOlStyle and toGhostOlStyle build styles', () => {
    expect(toTstmPreviewOlStyle()).toBeTruthy();
    expect(toGhostOlStyle({ outlookType: 'categorical', probability: 'TSTM', isCategorical: true })).toBeTruthy();
  });

  test('createLabelOverlaySource and createTileSource return sources for known styles', () => {
    expect(createLabelOverlaySource('osm')).toBeTruthy();
    expect(createLabelOverlaySource('carto-dark')).toBeTruthy();
    expect(createTileSource('osm')).toBeTruthy();
    expect(createTileSource('esri-satellite')).toBeTruthy();
  });

  test('hideOverlay clears the overlay position', () => {
    let position: unknown = 'set';
    const overlay = { setPosition: (next: unknown) => { position = next; } };
    hideOverlay(overlay as never);
    expect(position).toBeUndefined();
  });
});
