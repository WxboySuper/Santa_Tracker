import type { Feature, Polygon } from 'geojson';
import reducer, {
  addFeature,
  applyPaintBucketEdit,
  redoLastEdit,
  selectCanUndo,
  setActiveProbability,
  undoLastEdit,
} from './forecastSlice';

const createFeature = (id: string, probability: string): Feature => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  } as Polygon,
  properties: { outlookType: 'tornado', probability, isSignificant: false },
});

const recategorize = ({
  featureId,
  fromProbability,
  probabilityList,
}: {
  featureId: string;
  fromProbability: string;
  probabilityList: string[];
}) => {
  const state = reducer(undefined, addFeature({ feature: createFeature(featureId, fromProbability) }));
  return reducer(state, applyPaintBucketEdit({
    outlookType: 'tornado',
    featureId,
    fromProbability,
    action: 'recategorize',
    probabilityList,
  }));
};

describe('paint bucket reducer', () => {
  it('moves a feature between probability buckets', () => {
    const state = recategorize({
      featureId: 'bucket-feature',
      fromProbability: '5%',
      probabilityList: ['2%', '5%', '10%', '15%'],
    });

    expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.tornado?.get('5%')).toBeUndefined();
  });

  it('records the bucket move as one undoable edit', () => {
    let state = recategorize({
      featureId: 'bucket-feature',
      fromProbability: '5%',
      probabilityList: ['2%', '5%', '10%', '15%'],
    });

    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    state = reducer(state, undoLastEdit());
    expect(state.forecastCycle.days[1]?.data.tornado?.get('5%')).toHaveLength(1);
    state = reducer(state, redoLastEdit());
    expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')).toHaveLength(1);
  });

  it('uses the active probability while preserving the feature id', () => {
    const featureId = 'uuid-like-feature-id';
    let state = reducer(undefined, addFeature({ feature: createFeature(featureId, '2%') }));
    state = reducer(state, setActiveProbability('10%'));
    state = reducer(state, applyPaintBucketEdit({
      outlookType: 'tornado',
      featureId,
      fromProbability: '2%',
      action: 'recategorize',
      probabilityList: ['2%', '5%', '10%', '15%', 'CIG1', 'CIG2', 'CIG3'],
    }));

    expect(state.forecastCycle.days[1]?.data.tornado?.get('10%')).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')).toBeUndefined();
    expect(state.forecastCycle.days[1]?.data.tornado?.get('10%')?.[0].id).toBe(featureId);
  });
});
