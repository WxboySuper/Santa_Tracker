import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useForecastWorkspaceActionHandlers } from './forecastWorkspaceActions';
import { downloadGfcPackage } from '../../utils/fileUtils';
import type { ForecastCycle } from '../../types/outlooks';

jest.mock('../../utils/fileUtils', () => ({
  downloadGfcPackage: jest.fn(),
}));

const forecastCycle = {
  id: 'cycle',
  cycleDate: '2026-04-24',
  currentDay: 3,
  days: {},
} as ForecastCycle;

const setup = (overrides: Partial<Parameters<typeof useForecastWorkspaceActionHandlers>[0]> = {}) => {
  const dispatch = jest.fn();
  const onLoad = jest.fn();
  const addToast = jest.fn();
  const setIsEditingDate = jest.fn();
  const setIsPackageDownloading = jest.fn();
  const handleCancelReset = jest.fn();
  const input = document.createElement('input');
  input.click = jest.fn();

  const params = {
    dispatch,
    onLoad,
    mapRef: { current: { getView: jest.fn(() => ({ center: [1, 2], zoom: 7 })) } },
    addToast,
    forecastCycle,
    cycleMetadata: undefined,
    currentDay: 3,
    canUndo: true,
    canRedo: false,
    tempDate: '2026-04-25',
    setIsEditingDate,
    setIsPackageDownloading,
    fileInputRef: { current: input },
    handleCancelReset,
    ...overrides,
  } as Parameters<typeof useForecastWorkspaceActionHandlers>[0];

  const { result } = renderHook(() => useForecastWorkspaceActionHandlers(params));
  return { result, dispatch, onLoad, addToast, setIsEditingDate, setIsPackageDownloading, handleCancelReset, input };
};

describe('useForecastWorkspaceActionHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (downloadGfcPackage as jest.Mock).mockResolvedValue();
  });

  test('dispatches core workspace actions and respects history availability', () => {
    const { result, dispatch, setIsEditingDate, handleCancelReset } = setup();

    act(() => {
      result.current.onUndo();
      result.current.onRedo();
      result.current.onPrevDay();
      result.current.onNextDay();
      result.current.onToggleLowProbability();
      result.current.onDateSave();
      result.current.onReset();
    });

    expect(dispatch).toHaveBeenCalledTimes(6);
    expect(setIsEditingDate).toHaveBeenCalledWith(false);
    expect(handleCancelReset).toHaveBeenCalledTimes(1);
  });

  test('handles day clicks, file selection, load click, and day boundaries', () => {
    const file = new File(['forecast'], 'forecast.gfc');
    const { result, dispatch, onLoad, input } = setup({ currentDay: 1 });

    act(() => {
      result.current.onPrevDay();
      result.current.onDayButtonClick({ currentTarget: { dataset: { day: '5' } } } as React.MouseEvent<HTMLButtonElement>);
      result.current.onDayButtonClick({ currentTarget: { dataset: { day: 'oops' } } } as React.MouseEvent<HTMLButtonElement>);
      result.current.onLoadClick();
      result.current.onFileSelect({ target: { files: [file], value: 'C:\\fake\\forecast.gfc' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(input.click).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(file);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('downloads packages with map view, fallback view, and error toast', async () => {
    const first = setup();

    await act(async () => {
      first.result.current.onPackageDownload();
      await Promise.resolve();
    });

    expect(downloadGfcPackage).toHaveBeenCalledWith(forecastCycle, { center: [1, 2], zoom: 7 }, undefined, 'cycle');
    expect(first.addToast).toHaveBeenCalledWith('Cycle package downloaded!', 'success');
    expect(first.setIsPackageDownloading).toHaveBeenLastCalledWith(false);

    (downloadGfcPackage as jest.Mock).mockRejectedValueOnce(new Error('zip failed'));
    const second = setup({ mapRef: { current: null } });

    await act(async () => {
      second.result.current.onPackageDownload();
      await Promise.resolve();
    });

    expect(downloadGfcPackage).toHaveBeenLastCalledWith(forecastCycle, { center: [39.8283, -98.5795], zoom: 4 }, undefined, 'cycle');
    expect(second.addToast).toHaveBeenCalledWith('Failed to create package.', 'error');
  });

  test('exports the active workflow as a scoped package', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.onWorkflowPackageDownload();
      await Promise.resolve();
    });
    expect(downloadGfcPackage).toHaveBeenCalledWith(forecastCycle, { center: [1, 2], zoom: 7 }, undefined, 'workflow');
  });
});
