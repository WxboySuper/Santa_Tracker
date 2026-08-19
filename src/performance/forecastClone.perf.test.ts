import type { Feature } from 'geojson';
import { cloneJsonValue } from '../store/cloneJsonValue';
import forecastReducer, { addFeature, setOutlookOpacity } from '../store/forecastSlice';
import { measure, reportComparison } from './benchmarkUtils';

/**
 * Pinned copy of the pre-PERF-01 algorithm used as the benchmark baseline.
 * Keep it local to the performance fixture so production code cannot use the
 * slower path accidentally; update it only when the historical baseline
 * contract changes.
 */
const cloneLegacyJsonValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneLegacyJsonValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(objectValue).map(([key, item]) => [key, cloneLegacyJsonValue(item)]),
    ) as T;
  }

  return value;
};

const createFeature = (index: number): Feature => ({
  type: 'Feature',
  id: `benchmark-${index}`,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [index, index],
      [index + 1, index],
      [index + 1, index + 1],
      [index, index + 1],
      [index, index],
    ]],
  },
  properties: {
    outlookType: 'tornado',
    probability: '2%',
    isSignificant: false,
    tags: ['benchmark', 'history', { index, label: `feature-${index}` }],
  },
});

const getLatestSnapshotFeatures = (state: ReturnType<typeof forecastReducer>) => {
  const undoStack = state.historyByDay[1]!.undoStack;
  const previousSnapshot = undoStack[undoStack.length - 2]!.snapshot.data.tornado!.get('2%')![0];
  const latestSnapshot = undoStack[undoStack.length - 1]!.snapshot.data.tornado!.get('2%')![0];
  const liveFeature = state.forecastCycle.days[1]!.data.tornado!.get('2%')![0];

  return { previousSnapshot, latestSnapshot, liveFeature };
};

describe('forecast snapshot clone performance', () => {
  test('compares the current clone path with the previous allocation-heavy path', () => {
    if (process.env.GFC_PERF !== '1') return;

    const features = Array.from({ length: 256 }, (_, index) => createFeature(index));
    const expected = cloneLegacyJsonValue(features);
    const actual = cloneJsonValue(features);

    expect(actual).toEqual(expected);
    expect(actual).not.toBe(features);
    expect(actual[0]).not.toBe(features[0]);

    const options = { iterations: 100, samples: 7, warmup: 3 };
    const baseline = measure(() => {
      cloneLegacyJsonValue(features);
    }, options);
    const optimized = measure(() => {
      cloneJsonValue(features);
    }, options);

    reportComparison('forecast snapshot clone (256 features)', baseline, optimized);
  });

  test('measures repeated history snapshots with unchanged features', () => {
    if (process.env.GFC_PERF !== '1') return;

    const features = Array.from({ length: 256 }, (_, index) => createFeature(index));
    let state = forecastReducer(undefined, addFeature({ feature: features[0] }));
    for (const feature of features.slice(1)) {
      state = forecastReducer(state, addFeature({ feature }));
    }

    const cachedHistory = measure(() => {
      state = forecastReducer(state, setOutlookOpacity({ outlookType: 'tornado', opacity: 0.75 }));
    }, { iterations: 16, samples: 7, warmup: 3 });

    console.log(
      `forecast history snapshots (256 features, 16 unchanged edits): `
        + `${cachedHistory.medianMs.toFixed(2)} ms`,
    );
    const { previousSnapshot, latestSnapshot, liveFeature } = getLatestSnapshotFeatures(state);

    expect(latestSnapshot).toBe(previousSnapshot);
    expect(latestSnapshot).not.toBe(liveFeature);
  });
});
