import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useForecastWorkspaceActionHandlers } from './forecastWorkspaceActions';

const setup = (overrides: Partial<Parameters<typeof useForecastWorkspaceActionHandlers>[0]> = {}) => {
  const dispatch = jest.fn();
  const addToast = jest.fn();
  const setIsEditingDate = jest.fn();
  const setShowTransferModal = jest.fn();
  const setTransferDirection = jest.fn();
  const handleCancelReset = jest.fn();

  const params = {
    dispatch,
    mapRef: { current: { getView: jest.fn(() => ({ center: [1, 2], zoom: 7 })) } },
    addToast,
    currentDay: 3,
    canUndo: true,
    canRedo: false,
    tempDate: '2026-04-25',
    setIsEditingDate,
    setShowTransferModal,
    setTransferDirection,
    handleCancelReset,
    ...overrides,
  } as Parameters<typeof useForecastWorkspaceActionHandlers>[0];

  const { result } = renderHook(() => useForecastWorkspaceActionHandlers(params));
  return {
    result,
    dispatch,
    addToast,
    setIsEditingDate,
    setShowTransferModal,
    setTransferDirection,
    handleCancelReset,
  };
};

describe('useForecastWorkspaceActionHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('handles day clicks, transfer modal direction, and day boundaries', () => {
    const { result, dispatch, setShowTransferModal, setTransferDirection } = setup({ currentDay: 1 });

    act(() => {
      result.current.onPrevDay();
      result.current.onDayButtonClick({ currentTarget: { dataset: { day: '5' } } } as React.MouseEvent<HTMLButtonElement>);
      result.current.onDayButtonClick({ currentTarget: { dataset: { day: 'oops' } } } as React.MouseEvent<HTMLButtonElement>);
      result.current.onOpenTransferModal('import');
      result.current.onOpenTransferModal();
    });

    expect(setTransferDirection).toHaveBeenNthCalledWith(1, 'import');
    expect(setTransferDirection).toHaveBeenNthCalledWith(2, 'export');
    expect(setShowTransferModal).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
