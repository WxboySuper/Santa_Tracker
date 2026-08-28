import type { Feature, Polygon } from 'geojson';
import reducer, {
  addFeature,
  copyOutlookGeometryBetweenHazards,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  undoLastEdit,
} from './forecastSlice';

type Hazard = 'tornado' | 'wind';

const createFeature = ({
  id,
  outlookType,
  probability,
  offset,
}: { id: string; outlookType: Hazard; probability: string; offset: number }): Feature => ({
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
    ]],
  } as Polygon,
  properties: { outlookType, probability, isSignificant: false },
});

const addForecastFeature = (
  state: ReturnType<typeof reducer>,
  feature: Feature,
) => reducer(state, addFeature({ feature }));

describe('forecast geometry copy reducer', () => {
  it('copies geometry while keeping source polygons intact', () => {
    const state = addForecastFeature(
      reducer(undefined, setForecastDay(1)),
      createFeature({ id: 'wind-15', outlookType: 'wind', probability: '15%', offset: 0 }),
    );
    const nextState = reducer(state, copyOutlookGeometryBetweenHazards({
      sourceType: 'wind', targetType: 'tornado', mode: 'replace',
    }));
    const tornadoFeatures = nextState.forecastCycle.days[1]?.data.tornado?.get('15%') ?? [];
    const windFeatures = nextState.forecastCycle.days[1]?.data.wind?.get('15%') ?? [];

    expect(tornadoFeatures).toHaveLength(1);
    expect(tornadoFeatures[0].id).not.toBe('wind-15');
    expect(tornadoFeatures[0].properties?.outlookType).toBe('tornado');
    expect(tornadoFeatures[0].geometry).toEqual(windFeatures[0].geometry);
    expect(windFeatures[0].id).toBe('wind-15');
  });

  it('copies only the selected probability bucket', () => {
    let state = reducer(undefined, setForecastDay(1));
    state = addForecastFeature(state, createFeature({ id: 'wind-15', outlookType: 'wind', probability: '15%', offset: 0 }));
    state = addForecastFeature(state, createFeature({ id: 'wind-30', outlookType: 'wind', probability: '30%', offset: 1 }));
    state = addForecastFeature(state, createFeature({ id: 'tornado-30', outlookType: 'tornado', probability: '30%', offset: 2 }));
    const nextState = reducer(state, copyOutlookGeometryBetweenHazards({
      sourceType: 'wind', targetType: 'tornado', mode: 'replace', probabilityFilter: '15%',
    }));

    expect(nextState.forecastCycle.days[1]?.data.tornado?.get('15%')).toHaveLength(1);
    expect(nextState.forecastCycle.days[1]?.data.tornado?.get('30%')?.[0].id).toBe('tornado-30');
    expect(nextState.forecastCycle.days[1]?.data.wind?.get('30%')).toHaveLength(1);
  });

  it('records geometry copy as one undoable edit', () => {
    let state = reducer(undefined, setForecastDay(1));
    state = addForecastFeature(state, createFeature({ id: 'wind-15', outlookType: 'wind', probability: '15%', offset: 0 }));
    state = reducer(state, copyOutlookGeometryBetweenHazards({
      sourceType: 'wind', targetType: 'tornado', mode: 'replace',
    }));

    expect(state.forecastCycle.days[1]?.data.tornado?.get('15%')).toHaveLength(1);
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    state = reducer(state, undoLastEdit());
    expect(state.forecastCycle.days[1]?.data.tornado?.get('15%') ?? []).toHaveLength(0);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);
  });

  it('does not create an undo entry when there is no copyable geometry', () => {
    const state = reducer(reducer(undefined, setForecastDay(1)), copyOutlookGeometryBetweenHazards({
      sourceType: 'wind', targetType: 'tornado', mode: 'replace',
    }));

    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
  });
});
