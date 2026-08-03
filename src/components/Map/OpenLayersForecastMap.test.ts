/**
 * Unit tests for helper functions in OpenLayersForecastMap
 * Focuses on pure utilities to raise coverage without instantiating a full OL Map.
 */

import { jest } from '@jest/globals';

// Mock ol-mapbox-style (pulls pbf; avoid loading ESM module in Jest)
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock mapStyleUtils used by toOlStyle/toGhostOlStyle
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

import { createCanvasStub } from '../../testUtils';
import {
  toRgbaColor,
  createHatchPattern,
  resolveFillOpacity,
  createOutlookFill,
  resolveStrokeWidth,
  getFeatureIdentity,
  toUpdatedGeoJsonFeature,
  applyBlankLayerStyle,
  replaceLayerGroupLayers,
  isDrawableOutlookType,
  toOlStyle,
  toGhostOlStyle,
  removeDrawInteraction,
  getCustomFeatureIdentity,
  toUpdatedCustomFeature,
  createCustomFill,
  toCustomOlStyle,
} from './OpenLayersForecastMap';

type FeatureStub = {
  get: (key: string) => unknown;
  getGeometry: () => object | null;
};

type GeometryFormatStub = {
  writeGeometryObject: (geometry: object, options: { dataProjection: string; featureProjection: string }) => {
    type: string;
    coordinates: unknown[];
  };
};

type LayerGroupLike = {
  getLayers: () => {
    clear: () => void;
    push: (layer: unknown) => void;
    getArray?: () => unknown[];
  };
};

describe('OpenLayersForecastMap helpers', () => {
  let originalCreateElement: typeof document.createElement;

  beforeAll(() => {
    originalCreateElement = document.createElement;
  });

  afterAll(() => {
    document.createElement = originalCreateElement;
  });

  test('toRgbaColor handles empty, hex (3/6), rgb/rgba and invalid values', () => {
    expect(toRgbaColor({ color: '', alpha: 0.5 })).toBe('rgba(255, 255, 255, 0.5)');
    expect(toRgbaColor({ color: 'rgba(1,2,3,0.4)', alpha: 0.4 })).toBe('rgba(1,2,3,0.4)');
    expect(toRgbaColor({ color: 'rgb(4,5,6)', alpha: 0.8 })).toBe('rgb(4,5,6)');
    expect(toRgbaColor({ color: '#fff', alpha: 0.3 })).toBe('rgba(255, 255, 255, 0.3)');
    expect(toRgbaColor({ color: '#12ab34', alpha: 1 })).toBe('rgba(18, 171, 52, 1)');
    // Invalid hex should return original
    expect(toRgbaColor({ color: '#zzz', alpha: 0.2 })).toBe('#zzz');
  });

  test('createHatchPattern returns a pattern when canvas context exists', () => {
    document.createElement = createCanvasStub(originalCreateElement);

    const pattern = createHatchPattern({ cigLevel: 'CIG1' });
    expect(pattern).toBeTruthy();
  });

  test('resolveFillOpacity returns numeric or fallback', () => {
    expect(resolveFillOpacity({ fillOpacity: 0.6 })).toBe(0.6);
    // non-number falls back
    expect(resolveFillOpacity({ fillOpacity: 'abc' as unknown })).toBe(0.25);
  });

  test('createOutlookFill returns Fill for non-CIG and pattern or transparent fallback for CIG', () => {
    // Non-CIG should create a Fill (object)
    const f1 = createOutlookFill({ probability: 'P10', fillColor: '#123456', fillOpacity: 0.5 });
    expect(f1).toBeTruthy();

    // For CIG, stub canvas like earlier
    document.createElement = createCanvasStub(originalCreateElement);

    const f2 = createOutlookFill({ probability: 'CIG1', fillColor: '#000000', fillOpacity: 0.5 });
    expect(f2).toBeTruthy();
  });

  test('resolveStrokeWidth returns 3 for top layer, numeric weight otherwise, and default 2', () => {
    expect(resolveStrokeWidth({ weight: 5, isTopLayer: false })).toBe(5);
    expect(resolveStrokeWidth({ weight: 'a' as unknown as number, isTopLayer: false })).toBe(2);
    expect(resolveStrokeWidth({ weight: 1, isTopLayer: true })).toBe(3);
  });

  test('getFeatureIdentity returns null when missing parts and otherwise returns identity', () => {
    const okFeature: FeatureStub = { get: (k: string) => ({ featureId: 'f1', outlookType: 'categorical', probability: 'P10' }[k as 'featureId' | 'outlookType' | 'probability']), getGeometry: () => null };
    expect(getFeatureIdentity(okFeature)).toEqual({ featureId: 'f1', outlookType: 'categorical', probability: 'P10' });

    const badFeature: FeatureStub = { get: (k: string) => (k === 'featureId' ? undefined : 'x'), getGeometry: () => null };
    expect(getFeatureIdentity(badFeature)).toBeNull();
  });

  test('toUpdatedGeoJsonFeature returns null when identity or geometry missing and otherwise returns geojson feature', () => {
    const featureWithNoId: FeatureStub = { get: (k: string) => (k === 'featureId' ? undefined : 'x'), getGeometry: () => ({}) };
    const formatStub: GeometryFormatStub = { writeGeometryObject: jest.fn(() => ({ type: 'Polygon', coordinates: [] })) };
    expect(toUpdatedGeoJsonFeature(featureWithNoId, formatStub, false)).toBeNull();

    const feature: FeatureStub = {
      get: (k: string) => (k === 'featureId' ? 'id123' : (k === 'outlookType' ? 'categorical' : 'P10')),
      getGeometry: () => ({ some: 'geom' }),
    };

    const result = toUpdatedGeoJsonFeature(feature, formatStub, true);
    expect(result).toBeTruthy();
    expect(result?.type).toBe('Feature');
    expect(result?.properties).toHaveProperty('derivedFrom');
  });

  test('applyBlankLayerStyle calls setStyle only when present', () => {
    const called: string[] = [];
    const good = { setStyle: (_style: unknown) => called.push('good') };
    const bad = { notAStyle: true };
    applyBlankLayerStyle([good, bad], {} as never);
    expect(called).toEqual(['good']);
  });

  test('replaceLayerGroupLayers copies layers from source to target via layer containers', () => {
    const pushed: unknown[] = [];
    const target: LayerGroupLike = { getLayers: () => ({ clear: () => { pushed.length = 0; }, push: (layer: unknown) => pushed.push(layer) }) };
    const source: LayerGroupLike = { getLayers: () => ({ clear: () => undefined, push: () => undefined, getArray: () => ['a', 'b'] }) };
    replaceLayerGroupLayers(target as never, source as never);
    expect(pushed).toEqual(['a', 'b']);
  });

  test('isDrawableOutlookType recognizes drawable types', () => {
    expect(isDrawableOutlookType({ outlookType: 'categorical' })).toBe(true);
    expect(isDrawableOutlookType({ outlookType: 'nonexistent' })).toBe(false);
  });

  test('GFC-WEB-D: clears the delayed pointer callback before map teardown', () => {
    jest.useFakeTimers();
    try {
      const pendingCallback = jest.fn();
      const timeout = setTimeout(pendingCallback, 250);
      const draw = { downTimeout_: timeout };
      const map = { removeInteraction: jest.fn() };

      removeDrawInteraction(map as never, draw as never);
      jest.advanceTimersByTime(250);

      expect(pendingCallback).not.toHaveBeenCalled();
      expect(draw.downTimeout_).toBeUndefined();
      expect(map.removeInteraction).toHaveBeenCalledWith(draw);
    } finally {
      jest.useRealTimers();
    }
  });

  test('toOlStyle and toGhostOlStyle return style objects', () => {
    const s1 = toOlStyle({ outlookType: 'categorical', probability: 'P10' }, { isTopLayer: false });
    const s2 = toGhostOlStyle({ outlookType: 'categorical', probability: 'P10', isCategorical: true });
    expect(s1).toBeTruthy();
    expect(s2).toBeTruthy();
  });

  test('custom feature identity and geometry round-trip stay separate from severe metadata', () => {
    const values = { featureId: 'custom-1', customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Heavy snow' };
    const feature: FeatureStub = { get: (key) => values[key as keyof typeof values], getGeometry: () => ({ type: 'Polygon' }) };
    expect(getCustomFeatureIdentity(feature)).toEqual(values);
    const format: GeometryFormatStub = { writeGeometryObject: () => ({ type: 'Polygon', coordinates: [] }) };
    expect(toUpdatedCustomFeature(feature, format as never)?.properties).toEqual({ customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Heavy snow' });
    expect(getFeatureIdentity(feature)).toBeNull();
  });

  test('custom solid style preserves color, opacity, stroke, and category order', () => {
    const style = toCustomOlStyle({
      id: 'cat-1' as never, label: 'Heavy snow', order: 4,
      style: { fillColor: '#3b82f6', fillOpacity: .45, strokeColor: '#ffffff', strokeOpacity: .9, strokeWidth: 2, hatch: 'none' },
    });
    expect(style.getFill()?.getColor()).toBe('rgba(59, 130, 246, 0.45)');
    expect(style.getStroke()?.getColor()).toBe('rgba(255, 255, 255, 0.9)');
    expect(style.getZIndex()).toBe(704);
  });

  test.each([
    ['diagonal', [[-12, 12, 12, -12], [-12, 24, 24, -12], [0, 24, 24, 0]]],
    ['reverse-diagonal', [[-12, 0, 12, 24], [-12, -12, 24, 24], [0, -12, 24, 12]]],
    ['crosshatch', [[-12, 12, 12, -12], [-12, 24, 24, -12], [0, 24, 24, 0], [-12, 0, 12, 24], [-12, -12, 24, 24], [0, -12, 24, 12]]],
  ] as const)('custom %s hatch lines continue at every repeated tile edge', (hatch, expectedLines) => {
    const calls: number[][] = [];
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return originalCreateElement.call(document, tag);
      const context = {
        fillStyle: '', strokeStyle: '', lineWidth: 0,
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn((x: number, y: number) => calls.push([x, y])),
        lineTo: jest.fn((x: number, y: number) => calls[calls.length - 1].push(x, y)),
        stroke: jest.fn(),
        createPattern: jest.fn(() => 'custom-pattern'),
      };
      return { width: 0, height: 0, getContext: () => context } as unknown as HTMLElement;
    }) as typeof document.createElement);

    try {
      createCustomFill({ fillColor: '#3b82f6', fillOpacity: .45, strokeColor: '#ffffff', strokeOpacity: .9, strokeWidth: 2, hatch });
      expect(calls).toEqual(expectedLines);
    } finally {
      createElementSpy.mockRestore();
    }
  });

  test('toOlStyle transparencyScale reduces fill and stroke alpha', () => {
    const base = toOlStyle({ outlookType: 'categorical', probability: 'P10' });
    const scaled = toOlStyle(
      { outlookType: 'categorical', probability: 'P10' },
      { transparencyScale: 0.4 },
    );

    expect(base.getFill()?.getColor()).toBe('rgba(17, 34, 51, 0.5)');
    expect(scaled.getFill()?.getColor()).toBe('rgba(17, 34, 51, 0.2)');
    expect(base.getStroke()?.getColor()).toBe('rgba(68, 85, 102, 0.9)');
    expect(scaled.getStroke()?.getColor()).toMatch(/^rgba\(68, 85, 102, 0\.36/);
  });
});
