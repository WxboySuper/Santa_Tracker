import {
  applyPaintBucketStrategy,
  resolveTargetProbability,
} from './applyPaintBucketStrategy';
import { isPaintBucketOutlookType, resolvePaintBucketEditAction } from './outlookScope';

const combinedProbabilityList = ['2%', '5%', '10%', '15%', '30%', '45%', '60%', 'CIG0', 'CIG1', 'CIG2'] as const;

const square = ({
  id,
  probability,
  offset = 0,
  size = 1,
}: { id: string; probability: string; offset?: number; size?: number }) => ({
  type: 'Feature' as const,
  id,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [offset, offset],
      [offset + size, offset],
      [offset + size, offset + size],
      [offset, offset + size],
      [offset, offset],
    ]],
  },
  properties: {
    outlookType: 'tornado',
    probability,
  },
});

const buildMap = (feature: ReturnType<typeof square>) => new Map([
  [feature.properties.probability, [feature]],
]);

const runStrategy = ({
  sourceProbability,
  action,
  activeProbability,
  probabilityList = ['2%', '5%', '10%', '15%'],
}: {
  sourceProbability: string;
  action: 'recategorize' | 'step-up';
  activeProbability: string;
  probabilityList?: readonly string[];
}) => {
  const feature = square({ id: 'a', probability: sourceProbability });
  const map = buildMap(feature);
  return {
    map,
    result: applyPaintBucketStrategy(map, {
    outlookType: 'tornado',
    featureId: feature.id,
    fromProbability: sourceProbability,
    action,
    activeProbability,
    probabilityList,
    }),
  };
};

describe('resolvePaintBucketEditAction', () => {
  test('step mode uses shift for step-down', () => {
    expect(resolvePaintBucketEditAction('step', false)).toBe('step-up');
    expect(resolvePaintBucketEditAction('step', true)).toBe('step-down');
  });

  test('assign mode always recategorizes', () => {
    expect(resolvePaintBucketEditAction('assign', false)).toBe('recategorize');
    expect(resolvePaintBucketEditAction('assign', true)).toBe('recategorize');
  });
});

describe('isPaintBucketOutlookType', () => {
  test('allows probabilistic outlook types only', () => {
    expect(isPaintBucketOutlookType('tornado')).toBe(true);
    expect(isPaintBucketOutlookType('wind')).toBe(true);
    expect(isPaintBucketOutlookType('categorical')).toBe(false);
  });
});

describe('resolveTargetProbability', () => {
  const list = ['2%', '5%', '10%', '15%'] as const;
  test('recategorize uses the active probability', () => {
    expect(resolveTargetProbability('recategorize', '5%', '15%', list)).toBe('15%');
    expect(resolveTargetProbability('recategorize', '15%', '15%', list)).toBeNull();
  });

  test('step up and down move one slot', () => {
    expect(resolveTargetProbability('step-up', '5%', '2%', list)).toBe('10%');
    expect(resolveTargetProbability('step-down', '10%', '2%', list)).toBe('5%');
    expect(resolveTargetProbability('step-up', '15%', '2%', list)).toBeNull();
    expect(resolveTargetProbability('step-down', '2%', '2%', list)).toBeNull();
  });

  test('step up crosses from the highest probability into CIG levels', () => {
    expect(resolveTargetProbability('step-up', '60%', '2%', combinedProbabilityList)).toBe('CIG0');
    expect(resolveTargetProbability('step-up', 'CIG1', '2%', combinedProbabilityList)).toBe('CIG2');
  });

  test('step down crosses from CIG0 back to the highest probability', () => {
    expect(resolveTargetProbability('step-down', 'CIG0', '2%', combinedProbabilityList)).toBe('60%');
    expect(resolveTargetProbability('step-down', 'CIG1', '2%', combinedProbabilityList)).toBe('CIG0');
  });
});

describe('applyPaintBucketStrategy', () => {
  test('recategorize moves a feature between keys', () => {
    const { result } = runStrategy({ sourceProbability: '5%', action: 'recategorize', activeProbability: '15%' });

    expect(result.changed).toBe(true);
    expect(result.targetProbability).toBe('15%');
    expect(result.map.get('5%')).toBeUndefined();
    expect(result.map.get('15%')?.[0].properties?.probability).toBe('15%');
  });

  test('step-up promotes without changing the active brush', () => {
    const { result } = runStrategy({ sourceProbability: '10%', action: 'step-up', activeProbability: '2%' });

    expect(result.map.get('15%')).toHaveLength(1);
    expect(result.map.get('10%')).toBeUndefined();
  });

  test('moves only the selected feature when risk polygons overlap', () => {
    const selected = square({ id: 'selected', probability: '5%' });
    const overlapping = square({ id: 'overlapping', probability: '10%' });
    const map = new Map([
      ['5%', [selected]],
      ['10%', [overlapping]],
    ]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'selected',
      fromProbability: '5%',
      action: 'recategorize',
      activeProbability: '15%',
      probabilityList: combinedProbabilityList,
    });

    expect(result.map.get('15%')?.map((feature) => feature.id)).toEqual(['selected']);
    expect(result.map.get('10%')?.map((feature) => feature.id)).toEqual(['overlapping']);
  });

  test('preserves holes and multipolygon geometry while moving a feature', () => {
    const feature = {
      type: 'Feature' as const,
      id: 'complex',
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: [
          [
            [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
            [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]],
          ],
          [
            [[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]],
          ],
        ],
      },
      properties: { outlookType: 'tornado', probability: '5%' },
    };
    const map = new Map([['5%', [feature]]]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'complex',
      fromProbability: '5%',
      action: 'recategorize',
      activeProbability: '15%',
      probabilityList: combinedProbabilityList,
    });

    expect(result.map.get('15%')?.[0].geometry).toEqual(feature.geometry);
  });

  test('returns unchanged map when target equals source', () => {
    const { map, result } = runStrategy({ sourceProbability: '10%', action: 'recategorize', activeProbability: '10%' });

    expect(result.changed).toBe(false);
    expect(result.map).toBe(map);
  });
});
