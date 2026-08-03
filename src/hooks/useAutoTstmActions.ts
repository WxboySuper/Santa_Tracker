import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Dispatch } from '@reduxjs/toolkit';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { commitAutoTstmPreview } from './autoTstmApply';
import { runAutoTstmPreviewFetch } from './autoTstmPreviewFetch';
import type { AutoTstmStatus } from './useAutoTstmState';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

type UseAutoTstmActionsArgs = {
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  isDaySupported: boolean;
  preview: PreviewState | null;
  abortRef: MutableRefObject<AbortController | null>;
  activeRequestRef: MutableRefObject<TstmGenerationRequest | null>;
  clearInFlightRequest: () => void;
  clearPreview: () => void;
  closePanel: () => void;
  setIsPanelOpen: (value: boolean) => void;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
  setPreview: (value: PreviewState | null) => void;
};

/** Builds Auto-TSTM panel and preview action handlers for the orchestration hook. */
export const useAutoTstmActions = ({
  dispatch,
  forecastCycle,
  currentDay,
  isDaySupported,
  preview,
  abortRef,
  activeRequestRef,
  clearInFlightRequest,
  clearPreview,
  closePanel,
  setIsPanelOpen,
  setStatus,
  setErrorMessage,
  setPreview,
}: UseAutoTstmActionsArgs) => {
  const openPanel = useCallback(() => {
    if (isDaySupported) {
      setIsPanelOpen(true);
    }
  }, [isDaySupported, setIsPanelOpen]);

  const fetchPreview = useCallback(async () => {
    await runAutoTstmPreviewFetch({
      isDaySupported,
      forecastCycle,
      currentDay,
      clearInFlightRequest,
      abortRef,
      activeRequestRef,
      setStatus,
      setErrorMessage,
      setPreview,
    });
  }, [
    abortRef,
    activeRequestRef,
    clearInFlightRequest,
    currentDay,
    forecastCycle,
    isDaySupported,
    setErrorMessage,
    setPreview,
    setStatus,
  ]);

  const applyPreview = useCallback(() => {
    if (!preview) {
      return;
    }

    commitAutoTstmPreview({
      preview,
      forecastCycle,
      currentDay,
      dispatch,
      clearPreview,
      closePanel,
      setErrorMessage,
      setStatus,
    });
  }, [clearPreview, closePanel, currentDay, dispatch, forecastCycle, preview, setErrorMessage, setStatus]);

  const cancelPreview = useCallback(() => {
    closePanel();
  }, [closePanel]);

  return {
    openPanel,
    fetchPreview,
    applyPreview,
    cancelPreview,
  };
};
