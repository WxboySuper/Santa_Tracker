import React from 'react';
import { Provider } from 'react-redux';
import { act, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import useAutoCategorical, {
  processDay12OutlooksToCategorical,
  processDay3OutlooksToCategorical,
  processOutlooksToCategorical,
} from '../useAutoCategorical';
import { OutlookData } from '../../types/outlooks';
import { Feature, Polygon } from 'geojson';
import * as turf from '@turf/turf';
import forecastReducer, { addFeature, undoLastEdit, updateFeature } from '../../store/forecastSlice';

const mockUuid = jest.fn(() => 'mock-uuid');

jest.mock('uuid', () => ({
  v4: () => mockUuid(),
}));

jest.mock('@turf/turf', () => {
  const actual = jest.requireActual<typeof import('@turf/turf')>('@turf/turf');
  return {
    ...actual,
    featureCollection: jest.fn((...args: Parameters<typeof actual.featureCollection>) =>
      actual.featureCollection(...args)),
  };
});

const makeFeature = (id: string): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
  properties: {}
});

const makeProbabilisticFeature = (id: string, offset: number): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [offset, offset],
      [offset + 1, offset],
      [offset + 1, offset + 1],
      [offset, offset + 1],
      [offset, offset],
    ]]
  },
  properties: {
    outlookType: 'tornado',
    probability: '30%',
    isSignificant: false
  }
});

const makeSquare = (id: string, offset: number, size = 2): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [offset, offset],
      [offset + size, offset],
      [offset + size, offset + size],
      [offset, offset + size],
      [offset, offset],
    ]],
  },
  properties: {},
});

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false
  })
});

const HookHarness = () => {
  useAutoCategorical();
  return null;
};

const getCategoricalFeatures = (store: ReturnType<typeof createStore>) =>
  store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('ENH') || [];

describe('processOutlooksToCategorical', () => {
  beforeEach(() => {
    mockUuid.mockReset();
    mockUuid.mockImplementation(() => 'mock-uuid');
  });

  test('returns empty array for empty outlooks', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.length).toBe(0);
  });

  test('converts single tornado probability to categorical feature', () => {
    const feature = makeFeature('t1');
    const outlooks: OutlookData = {
      tornado: new Map([['30%', [feature]]]),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((feature) => feature.properties?.outlookType === 'categorical')).toBe(true);
    expect(result.some((feature) => feature.properties?.probability === 'ENH')).toBe(true);
  });

  test('ignores day 4-8 and missing day 3 total severe data', () => {
    const outlooks: OutlookData = {
      tornado: new Map([['30%', [makeFeature('t1')]]]),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    expect(processOutlooksToCategorical(outlooks, 4)).toEqual([]);
    expect(processDay3OutlooksToCategorical(outlooks)).toEqual([]);
  });

  test('converts day 3 total severe and filters invalid geometries', () => {
    mockUuid.mockReturnValueOnce('day3-id');
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map(),
      totalSevere: new Map([
        ['30%', [makeFeature('valid'), { type: 'Feature', id: 'bad', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} } as never]],
      ]),
    };

    const result = processDay3OutlooksToCategorical(outlooks);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('day3-id');
    expect(result[0].properties?.outlookType).toBe('categorical');
  });

  test.each([
    [
      'empty legacy plain-object maps',
      { tornado: {}, wind: {}, hail: {}, categorical: {} },
      0,
    ],
    [
      'legacy plain-object wind probabilities',
      { tornado: {}, wind: { '30%': [makeFeature('wind')] }, hail: new Map(), categorical: {} },
      1,
    ],
  ] as const)(
    'GFC-WEB-7: processDay12OutlooksToCategorical tolerates %s',
    (_label, outlooks, minFeatures) => {
      const typedOutlooks = outlooks as unknown as OutlookData;
      expect(() => processDay12OutlooksToCategorical(typedOutlooks)).not.toThrow();
      const result = processDay12OutlooksToCategorical(typedOutlooks);
      if (minFeatures === 0) {
        expect(result).toEqual([]);
      } else {
        expect(result.length).toBeGreaterThanOrEqual(minFeatures);
      }
    },
  );

  test('handles hatching intersections and union fallbacks for day 1 and day 2', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map([
        ['30%', [makeFeature('wind')]],
        ['CIG1', [makeFeature('wind-hatch')]],
      ]),
      hail: new Map([
        ['30%', [makeFeature('hail-a'), makeFeature('hail-b')]],
      ]),
      categorical: new Map()
    };

    expect(processDay12OutlooksToCategorical(outlooks).length).toBeGreaterThan(0);
    expect(processOutlooksToCategorical(outlooks, 2).length).toBeGreaterThan(0);
  });

  test('maps hatching intersections to expected categorical risk levels', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map([
        ['30%', [makeSquare('wind-prob', 0)]],
        ['CIG1', [makeSquare('wind-hatch', 0)]],
      ]),
      hail: new Map(),
      categorical: new Map(),
    };

    const result = processDay12OutlooksToCategorical(outlooks);
    expect(result.some((feature) => feature.properties?.probability === 'ENH')).toBe(true);
  });

  test('builds cumulative categorical rings that include lower-tier geometry', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map([
        ['5%', [makeSquare('wind-mrgl', 0)]],
        ['30%', [makeSquare('wind-slgt', 4)]],
      ]),
      hail: new Map(),
      categorical: new Map(),
    };

    const result = processDay12OutlooksToCategorical(outlooks);
    const marginal = result.find((feature) => feature.properties?.probability === 'MRGL');
    const slight = result.find((feature) => feature.properties?.probability === 'SLGT');

    expect(marginal).toBeDefined();
    expect(slight).toBeDefined();
    expect(turf.booleanContains(marginal as Feature<Polygon>, slight as Feature<Polygon>)).toBe(true);
  });

  test('avoids redundant turf.featureCollection calls in hatching loops', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map([
        ['30%', [makeSquare('wind-prob', 0)]],
        ['CIG3', [makeSquare('wind-cig3', 0)]],
        ['CIG2', [makeSquare('wind-cig2', 0)]],
        ['CIG1', [makeSquare('wind-cig1', 0)]],
      ]),
      hail: new Map(),
      categorical: new Map(),
    };

    const featureCollectionMock = turf.featureCollection as jest.MockedFunction<typeof turf.featureCollection>;
    featureCollectionMock.mockClear();
    processDay12OutlooksToCategorical(outlooks);

    // Hatching unions may still allocate collections; intersect/difference should not per CIG iteration.
    expect(featureCollectionMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test('applies day 3 hatching and cumulative risk generation', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map(),
      totalSevere: new Map([
        ['15%', [makeSquare('severe-prob', 0)]],
        ['CIG1', [makeSquare('severe-hatch', 0)]],
        ['5%', [makeSquare('severe-mrgl', 5)]],
      ]),
    };

    const result = processDay3OutlooksToCategorical(outlooks);
    expect(result.some((feature) => feature.properties?.probability === 'SLGT')).toBe(true);
    expect(result.some((feature) => feature.properties?.probability === 'MRGL')).toBe(true);

    const marginal = result.find((feature) => feature.properties?.probability === 'MRGL');
    const slight = result.find((feature) => feature.properties?.probability === 'SLGT');
    expect(turf.booleanContains(marginal as Feature<Polygon>, slight as Feature<Polygon>)).toBe(true);
  });

  // Since we use turf intersection, robust testing requires valid geometries and turf mocking or integration.
  // The simple object identity checks are no longer valid as new features are created.

  test('undoing a probabilistic edit regenerates categorical output', async () => {
    const store = createStore();

    type ProviderProps = { store: ReturnType<typeof createStore>; children?: React.ReactNode };
    const ProviderComponent = Provider as unknown as React.ComponentType<ProviderProps>;
    render(React.createElement(ProviderComponent, { store }, React.createElement(HookHarness)));

    act(() => {
      store.dispatch(addFeature({ feature: makeProbabilisticFeature('feature-1', 0) }));
    });

    await waitFor(() => {
      expect(getCategoricalFeatures(store).length).toBeGreaterThan(0);
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);
    });

    act(() => {
      store.dispatch(updateFeature({ feature: makeProbabilisticFeature('feature-1', 3) }));
    });

    await waitFor(() => {
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);
    });

    act(() => {
      store.dispatch(undoLastEdit());
    });

    await waitFor(() => {
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);
    });
  });

  test('preserves manual TSTM geometry when regenerating categorical output', async () => {
    const store = createStore();
    type ProviderProps = { store: ReturnType<typeof createStore>; children?: React.ReactNode };
    const ProviderComponent = Provider as unknown as React.ComponentType<ProviderProps>;
    render(React.createElement(ProviderComponent, { store }, React.createElement(HookHarness)));

    act(() => {
      store.dispatch(addFeature({
        feature: {
          ...makeFeature('manual-tstm'),
          properties: { outlookType: 'categorical', probability: 'TSTM' },
        }
      }));
      store.dispatch(addFeature({ feature: makeProbabilisticFeature('feature-1', 0) }));
    });

    await waitFor(() => {
      const categorical = store.getState().forecast.forecastCycle.days[1]?.data.categorical;
      expect(categorical?.get('TSTM')?.[0].id).toBe('manual-tstm');
      expect(categorical?.get('ENH')?.length).toBeGreaterThan(0);
    });
  });
});
