import forecastReducer, {
  addFeature,
  applyPaintBucketEdit,
  setActiveProbability,
} from './forecastSlice';
import type { Polygon } from 'geojson';

const createFeature = (id: string): { type: 'Feature'; id: string; geometry: Polygon; properties: Record<string, unknown> } => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: {
    outlookType: 'tornado',
    probability: '2%',
    isSignificant: false,
  },
});

describe('paint bucket redux reference updates', () => {
  test('applyPaintBucketEdit produces new outlook data reference', () => {
    let state = forecastReducer(undefined, addFeature({ feature: createFeature('test-id') }));
    const beforeOutlooks = state.forecastCycle.days[1]?.data;
    const beforeTornado = beforeOutlooks?.tornado;

    state = forecastReducer(state, setActiveProbability('10%'));
    state = forecastReducer(state, applyPaintBucketEdit({
      outlookType: 'tornado',
      featureId: 'test-id',
      fromProbability: '2%',
      action: 'recategorize',
      probabilityList: ['2%', '5%', '10%', '15%'],
    }));

    const afterOutlooks = state.forecastCycle.days[1]?.data;
    const afterTornado = afterOutlooks?.tornado;

    expect(afterTornado?.get('10%')).toHaveLength(1);
    expect(afterTornado?.get('2%')).toBeUndefined();
    expect(afterOutlooks).not.toBe(beforeOutlooks);
    expect(afterTornado).not.toBe(beforeTornado);
  });
});
