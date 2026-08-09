import type { Feature } from 'geojson';
import { cloneJsonValue } from '../store/forecastSlice';
import { measure, reportComparison } from './benchmarkUtils';

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
});
