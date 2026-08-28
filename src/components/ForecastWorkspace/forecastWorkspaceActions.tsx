import React, { useCallback } from 'react';
import {
  redoLastEdit,
  resetForecasts,
  setForecastDay,
  undoLastEdit,
  toggleLowProbability,
  setCycleDate,
} from '../../store/forecastSlice';
import type { ForecastMapHandle } from '../Map/ForecastMap';
import type { AddToastFn } from '../Layout';
import type { DayType } from '../../types/outlooks';
import { useDispatch } from 'react-redux';
import type { ForecastTransferDirection } from './ForecastTransferModal';

export interface ForecastWorkspaceActionParams {
  dispatch: ReturnType<typeof useDispatch>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
  currentDay: DayType;
  canUndo: boolean;
  canRedo: boolean;
  tempDate: string;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTransferModal: React.Dispatch<React.SetStateAction<boolean>>;
  setTransferDirection: React.Dispatch<React.SetStateAction<ForecastTransferDirection>>;
  handleCancelReset: () => void;
}

/** Returns the neighboring forecast day in the requested direction, or null at the ends. */
const getAdjacentDay = (currentDay: DayType, offset: -1 | 1): DayType | null => {
  const nextDay = currentDay + offset;
  if (nextDay < 1 || nextDay > 8) return null;
  return nextDay as DayType;
};

/** Parses the day button's data attribute into a DayType, or null when invalid. */
const getClickedDay = (e: React.MouseEvent<HTMLButtonElement>): DayType | null => {
  const day = Number(e.currentTarget.dataset.day);
  return Number.isNaN(day) ? null : (day as DayType);
};

/** Dispatches an action creator only when the corresponding history state allows it. */
const dispatchHistoryAction = (
  dispatch: ReturnType<typeof useDispatch>,
  isAvailable: boolean,
  actionCreator: typeof undoLastEdit | typeof redoLastEdit
) => {
  if (isAvailable) {
    dispatch(actionCreator());
  }
};

/** Constructs all event-handler callbacks for workspace actions. */
export const useForecastWorkspaceActionHandlers = ({
  dispatch,
  addToast,
  currentDay,
  canUndo,
  canRedo,
  tempDate,
  setIsEditingDate,
  setShowTransferModal,
  setTransferDirection,
  handleCancelReset,
}: ForecastWorkspaceActionParams) => {
  const handleOpenTransferModal = useCallback((direction: ForecastTransferDirection = 'export') => {
    setTransferDirection(direction);
    setShowTransferModal(true);
  }, [setShowTransferModal, setTransferDirection]);

  const handleReset = useCallback(() => {
    dispatch(resetForecasts());
    handleCancelReset();
    addToast('All drawings reset', 'info');
  }, [dispatch, addToast, handleCancelReset]);

  const handleDayChange = useCallback((day: DayType) => dispatch(setForecastDay(day)), [dispatch]);

  const handlePrevDay = useCallback(() => {
    const previousDay = getAdjacentDay(currentDay, -1);
    if (previousDay) {
      dispatch(setForecastDay(previousDay));
    }
  }, [dispatch, currentDay]);

  const handleNextDay = useCallback(() => {
    const nextDay = getAdjacentDay(currentDay, 1);
    if (nextDay) {
      dispatch(setForecastDay(nextDay));
    }
  }, [dispatch, currentDay]);

  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate, setIsEditingDate]);

  const handleDayButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const day = getClickedDay(e);
    if (day) {
      handleDayChange(day);
    }
  }, [handleDayChange]);

  const handleToggleLowProbability = useCallback(() => dispatch(toggleLowProbability()), [dispatch]);
  const handleUndo = useCallback(() => dispatchHistoryAction(dispatch, canUndo, undoLastEdit), [canUndo, dispatch]);
  const handleRedo = useCallback(() => dispatchHistoryAction(dispatch, canRedo, redoLastEdit), [canRedo, dispatch]);

  return {
    onUndo: handleUndo,
    onRedo: handleRedo,
    onOpenTransferModal: handleOpenTransferModal,
    onDateSave: handleDateSave,
    onDayButtonClick: handleDayButtonClick,
    onPrevDay: handlePrevDay,
    onNextDay: handleNextDay,
    onToggleLowProbability: handleToggleLowProbability,
    onReset: handleReset,
  };
};
