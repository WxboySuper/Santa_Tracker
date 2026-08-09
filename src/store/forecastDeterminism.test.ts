import type { UnknownAction } from '@reduxjs/toolkit';
import reducer, {
  addFeature,
  completeCycle,
  createOutlookUpdate,
  redoLastEdit,
  resetForecasts,
  saveCurrentCycle,
  setForecastDay,
  startBlankCycle,
  startFromPreviousCycle,
  undoLastEdit,
  updateFeature,
} from './forecastSlice';
import { readActionTimestamp } from './timestampMiddleware';
import type { Feature } from 'geojson';
import type { ForecastState } from './forecastSlice';

/**
 * Determinism regression tests for the forecast slice.
 *
 * Reducers must never read the clock, storage, DOM, or ambient mutable state.
 * Timestamps are carried on `action.meta.timestamp` (stamped by the store
 * middleware at dispatch time). Replaying the same action sequence from the
 * same state must therefore produce deeply equal output.
 */

const fixedTimestamp = '2026-07-04T12:00:00.000Z';

/** Wraps an action in the same shape the timestamp middleware produces. */
const withTimestamp = (action: UnknownAction): UnknownAction => ({
  ...action,
  meta: { ...(action.meta ?? {}), timestamp: fixedTimestamp },
});

const feature = (id: string, outlookType = 'tornado'): Feature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  properties: { outlookType, probability: '30%' },
} as Feature);

const runReplay = (actions: UnknownAction[]): ForecastState[] => {
  let state: ForecastState = reducer(undefined, { type: '@@init' });
  const outputs: ForecastState[] = [state];
  for (const action of actions) {
    state = reducer(state, withTimestamp(action));
    outputs.push(state);
  }
  return outputs;
};

describe('forecastSlice determinism', () => {
  test('replaying the same action sequence produces deeply equal output', () => {
    const actions: UnknownAction[] = [
      startBlankCycle({}),
      setForecastDay(2),
      addFeature({ feature: feature('f1') }),
      updateFeature({ feature: feature('f1') }),
      undoLastEdit(),
      redoLastEdit(),
      createOutlookUpdate(),
      saveCurrentCycle({}),
      resetForecasts(),
      startBlankCycle({}),
      completeCycle(),
      startFromPreviousCycle({ sourceCycleId: 'missing' }),
    ];

    const firstRun = runReplay(actions);
    const secondRun = runReplay(actions);

    expect(secondRun).toEqual(firstRun);
  });

  test('timestamps come from the action payload, not the reducer clock', () => {
    const withTimestampAction = withTimestamp(startBlankCycle({}));
    const state = reducer(undefined, withTimestampAction);
    expect(state.workflowMetadata?.createdAt ?? state.forecastCycle.days[1]?.metadata.createdAt).toBe(fixedTimestamp);
  });

  test('readActionTimestamp falls back to a stable timestamp for direct reducer calls', () => {
    expect(readActionTimestamp({ type: 'forecast/test' })).toBe('1970-01-01T00:00:00.000Z');
  });
});
