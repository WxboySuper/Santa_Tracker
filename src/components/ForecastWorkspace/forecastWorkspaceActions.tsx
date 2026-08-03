import React, { useCallback } from 'react';
import { downloadGfcPackage } from '../../utils/fileUtils';
import type { WorkflowExportScope } from '../../utils/workflowPackage';
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
import type { DayType, ForecastCycle } from '../../types/outlooks';
import type { CycleMetadata } from '../../types/workflow';
import { useDispatch } from 'react-redux';
import { trackWorkflowEvent } from '../../lib/workflowAnalytics';

export interface ForecastWorkspaceActionParams {
  dispatch: ReturnType<typeof useDispatch>;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
  forecastCycle: ForecastCycle;
  cycleMetadata?: CycleMetadata;
  currentDay: DayType;
  canUndo: boolean;
  canRedo: boolean;
  tempDate: string;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPackageDownloading: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleCancelReset: () => void;
}

/** Returns the selected file from a file input change event, or null when none was chosen. */
const getSelectedFile = (e: React.ChangeEvent<HTMLInputElement>): File | null => {
  return e.target.files?.[0] ?? null;
};

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

/** Downloads one package scope and reports success or failure without leaking errors to the caller. */
const downloadPackageForScope = async ({ scope, forecastCycle, cycleMetadata, mapRef, addToast, setIsPackageDownloading }: {
  scope: WorkflowExportScope;
  forecastCycle: ForecastCycle;
  cycleMetadata?: CycleMetadata;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
  setIsPackageDownloading: React.Dispatch<React.SetStateAction<boolean>>;
}): Promise<boolean> => {
  setIsPackageDownloading(true);
  try {
    const mapView = mapRef.current?.getView() ?? ({ center: [39.8283, -98.5795] as [number, number], zoom: 4 });
    await downloadGfcPackage(forecastCycle, mapView, cycleMetadata, scope);
    addToast(scope === 'workflow' ? 'Workflow package downloaded!' : 'Cycle package downloaded!', 'success');
    return true;
  } catch {
    addToast('Failed to create package.', 'error');
    return false;
  } finally {
    setIsPackageDownloading(false);
  }
};

/** Constructs all event-handler callbacks for workspace actions. */
export const useForecastWorkspaceActionHandlers = ({
  dispatch,
  onLoad,
  mapRef,
  addToast,
  forecastCycle,
  cycleMetadata,
  currentDay,
  canUndo,
  canRedo,
  tempDate,
  setIsEditingDate,
  setIsPackageDownloading,
  fileInputRef,
  handleCancelReset,
}: ForecastWorkspaceActionParams) => {
  const handlePackageDownload = useCallback(async (scope: WorkflowExportScope) => {
    const succeeded = await downloadPackageForScope({
      scope, forecastCycle, cycleMetadata, mapRef, addToast, setIsPackageDownloading,
    });
    trackWorkflowEvent('export', {
      result: succeeded ? 'success' : 'failure',
      entryPath: 'forecast-workspace',
      packageScope: scope,
    });
  }, [mapRef, forecastCycle, cycleMetadata, addToast, setIsPackageDownloading]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = getSelectedFile(e);
    if (file) {
      onLoad(file);
    }
    e.target.value = '';
  }, [onLoad]);

  const handleLoadClick = useCallback(() => fileInputRef.current?.click(), [fileInputRef]);

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
    onLoadClick: handleLoadClick,
    onPackageDownload: () => { handlePackageDownload('cycle'); },
    onWorkflowPackageDownload: () => { handlePackageDownload('workflow'); },
    onCyclePackageDownload: () => { handlePackageDownload('cycle'); },
    onDateSave: handleDateSave,
    onDayButtonClick: handleDayButtonClick,
    onPrevDay: handlePrevDay,
    onNextDay: handleNextDay,
    onToggleLowProbability: handleToggleLowProbability,
    onReset: handleReset,
    onFileSelect: handleFileSelect,
  };
};
