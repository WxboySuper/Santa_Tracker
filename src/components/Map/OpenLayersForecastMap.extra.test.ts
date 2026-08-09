/**
 * Additional unit tests for OpenLayersForecastMap helpers that are safe to run
 * without instantiating a full OpenLayers Map instance.
 */

import { jest } from '@jest/globals';

// Mock ol-mapbox-style to avoid ESM modules during tests
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock GeoJSON format so readFeatures returns predictable results when ensureBlankLayerLoaded constructs a GeoJSON instance
jest.mock('ol/format/GeoJSON', () => {
  return jest.fn().mockImplementation(() => ({
    readFeatures: jest.fn(() => [{ fake: 'feature-a' }]),
  }));
});

import {
  createLabelOverlaySource,
  createTileSource,
  hideOverlay,
  ensureBlankLayerLoaded,
} from './openLayersMapStyles';
import {
  BLANK_LAKE_STYLE,
  BLANK_WORLD_STYLE,
  createBlankLayerConfig,
} from './openLayersBlankBasemap';

type OverlayStub = {
  setPosition: (position: unknown) => void;
};

type BlankLayerConfigStub = {
  source: { addFeatures: (features: unknown[]) => void };
  isLoaded: () => boolean;
  url: string;
  getCache: () => unknown | null;
  setCache: (data: object) => void;
  style?: unknown;
};

describe('OpenLayersForecastMap additional helpers', () => {
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('createLabelOverlaySource returns a source for known styles and null for unknown', () => {
    const s1 = createLabelOverlaySource('osm');
    expect(s1).toBeTruthy();

    const s2 = createLabelOverlaySource('carto-dark');
    expect(s2).toBeTruthy();

    const s3 = createLabelOverlaySource('esri-satellite');
    expect(s3).toBeTruthy();

    expect(createLabelOverlaySource('nonexistent' as never)).toBeNull();
  });

  test('createTileSource returns a tile source for known styles', () => {
    const t1 = createTileSource('osm');
    expect(t1).toBeTruthy();

    const t2 = createTileSource('esri-satellite');
    expect(t2).toBeTruthy();
  });

  test('hideOverlay clears overlay position', () => {
    const overlay: OverlayStub = { setPosition: jest.fn() };
    hideOverlay(overlay as never);
    expect(overlay.setPosition).toHaveBeenCalled();
  });

  test('ensureBlankLayerLoaded returns early when already loaded', async () => {
    global.fetch = jest.fn();

    const config: BlankLayerConfigStub = {
      source: { addFeatures: jest.fn() },
      isLoaded: () => true,
      url: 'https://example.com/geo.json',
      getCache: () => null,
      setCache: jest.fn(),
      style: undefined,
    };

    await ensureBlankLayerLoaded(config);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(config.source.addFeatures).not.toHaveBeenCalled();
  });

  test('createBlankLayerConfig centralizes boundary URLs, styles, and cache ownership', () => {
    const source = { getFeatures: jest.fn(() => []), addFeatures: jest.fn() };
    const world = createBlankLayerConfig('worldCountries', source as never);
    const lakes = createBlankLayerConfig('lakes', source as never);
    const states = createBlankLayerConfig('usStates', source as never);

    expect(world.url).toBe('geodata/ne_110m_admin_0_countries.geojson');
    expect(lakes.url).toBe('geodata/ne_110m_lakes.geojson');
    expect(states.url).toBe('geodata/us-states.json');
    expect(world.style).toBe(BLANK_WORLD_STYLE);
    expect(lakes.style).toBe(BLANK_LAKE_STYLE);
    expect(states.style).toBeUndefined();

    const cached = { type: 'FeatureCollection' };
    world.setCache(cached);
    expect(world.getCache()).toBe(cached);
  });

  test('ensureBlankLayerLoaded fetches, caches and adds features when not loaded', async () => {
    const fakeGeo = { type: 'FeatureCollection', features: [] };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fakeGeo) });

    const added: unknown[] = [];
    const config: BlankLayerConfigStub = {
      source: { addFeatures: (features: unknown[]) => { added.push(...features); } },
      isLoaded: () => false,
      url: 'https://example.com/geo.json',
      getCache: () => null,
      setCache: jest.fn(),
      style: { /* style placeholder */ },
    };

    await ensureBlankLayerLoaded(config);
    expect(config.setCache).toHaveBeenCalled();
    // our mocked GeoJSON.readFeatures returns an array with one element
    expect(added.length).toBeGreaterThanOrEqual(1);
  });
});
