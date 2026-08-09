import * as fileUtils from '../utils/fileUtils';
import forecastReducer from '../store/forecastSlice';
import type { DiscussionData } from '../types/outlooks';
import {
  buildRestoreKey,
  buildRolloverSaveLabel,
  cycleHasDiscussionContent,
  formatRolloverDayLabel,
  getDayRolloverPromptState,
  hasRestorableCloudSelection,
  hasRolloverForecastData,
  hasUnpublishedDiscussionDrafts,
  hasUnsavedRolloverCandidateSession,
  parseStoredCloudMeta,
  parseStoredForecastPayload,
  runDayRolloverCloudSaveAction,
  runDayRolloverDownloadAction,
} from './forecastPageController';

const createForecastCycle = () =>
  forecastReducer(undefined, { type: '@@forecastPageController/test' }).forecastCycle;

describe('forecastPageController', () => {
  test('owns rollover labels, restore metadata parsing, and scope helpers', () => {
    expect(buildRolloverSaveLabel('2026-04-24')).toContain('Apr 24');
    expect(formatRolloverDayLabel('2026-04-24')).toContain('April 24');
    expect(formatRolloverDayLabel('bad-date')).toBe('bad-date');
    expect(parseStoredForecastPayload(null)).toBeNull();
    expect(parseStoredForecastPayload('not-json')).toBeNull();
    expect(parseStoredCloudMeta('{"id":"abc","label":"Cycle"}')).toEqual({
      id: 'abc',
      label: 'Cycle',
    });
    expect(hasRestorableCloudSelection({ id: 'abc', label: 'Cycle' })).toBe(true);
    expect(hasRestorableCloudSelection({ id: 'abc' })).toBe(false);
    expect(buildRestoreKey(null)).toBe('anonymous');
    expect(buildRestoreKey('user-1')).toBe('user-1');
  });

  test('derives rollover candidates and preserves pending prompts', () => {
    const emptyCycle = createForecastCycle();
    const cycleWithDiscussion = {
      ...emptyCycle,
      days: {
        ...emptyCycle.days,
        1: {
          ...emptyCycle.days[1],
          discussion: { mode: 'diy', diyContent: 'A discussion' },
        },
      },
    } as Parameters<typeof cycleHasDiscussionContent>[0];

    expect(hasRolloverForecastData(emptyCycle)).toBe(false);
    expect(cycleHasDiscussionContent(cycleWithDiscussion)).toBe(true);
    expect(hasUnsavedRolloverCandidateSession(cycleWithDiscussion, false)).toBe(true);
    expect(hasUnpublishedDiscussionDrafts({})).toBe(false);
    expect(hasUnpublishedDiscussionDrafts({
      anonymous: { mode: 'diy', diyContent: 'draft' } as DiscussionData,
    })).toBe(true);

    const pendingPrompt = { previousDay: '2026-04-23', currentDay: '2026-04-24' };
    expect(getDayRolloverPromptState({
      restoreComplete: true,
      lastActiveDay: '2026-04-24',
      today: '2026-04-24',
      alreadyPromptedToday: true,
      pendingPrompt,
      promptOpen: false,
      forecastCycle: emptyCycle,
      isSaved: true,
    })).toEqual(pendingPrompt);
  });

  test('resets only after rollover download or cloud save succeeds', async () => {
    const forecastCycle = createForecastCycle();
    const mapView = { center: [0, 0] as [number, number], zoom: 4 };
    const dispatch = jest.fn();
    const clearCurrent = jest.fn();
    const exportSpy = jest.spyOn(fileUtils, 'exportForecastToJson').mockImplementation(() => undefined);

    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch })).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);

    exportSpy.mockImplementationOnce(() => { throw new Error('download failed'); });
    dispatch.mockClear();
    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    const saveCycle = jest.fn().mockResolvedValue(true);
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({
      forecastCycle,
      currentMapView: mapView,
      saveCycle,
      clearCurrent,
      dispatch,
    })).toBe(true);
    expect(clearCurrent).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);

    saveCycle.mockResolvedValueOnce(false);
    clearCurrent.mockClear();
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({
      forecastCycle,
      currentMapView: mapView,
      saveCycle,
      clearCurrent,
      dispatch,
    })).toBe(false);
    expect(clearCurrent).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    exportSpy.mockRestore();
  });
});
