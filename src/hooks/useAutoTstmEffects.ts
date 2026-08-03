import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import {
  CONTEXT_CHANGED_MESSAGE,
  isStaleActiveTstmRequest,
  isStaleTstmContext,
} from './autoTstmContextGuards';
import type { AutoTstmStatus } from './useAutoTstmState';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

/** Fetches cached guidance when the Auto-TSTM panel opens. */
export const useAutoTstmPanelFetchEffect = (
  isPanelOpen: boolean,
  fetchPreviewRef: MutableRefObject<(() => Promise<void>) | null>,
) => {
  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }
    fetchPreviewRef.current?.().catch(() => undefined);
  }, [fetchPreviewRef, isPanelOpen]);
};

/** Aborts in-flight requests when forecast context changes while the panel is open. */
export const useAutoTstmActiveRequestGuard = ({
  isPanelOpen,
  forecastCycle,
  currentDay,
  activeRequestRef,
  clearInFlightRequest,
  setPreview,
  setStatus,
  setErrorMessage,
}: {
  isPanelOpen: boolean;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  activeRequestRef: MutableRefObject<TstmGenerationRequest | null>;
  clearInFlightRequest: () => void;
  setPreview: (value: PreviewState | null) => void;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
}) => {
  useEffect(() => {
    if (!isPanelOpen || !isStaleActiveTstmRequest(activeRequestRef.current, forecastCycle, currentDay)) {
      return;
    }
    clearInFlightRequest();
    setPreview(null);
    setStatus('error');
    setErrorMessage(CONTEXT_CHANGED_MESSAGE);
  }, [
    activeRequestRef,
    clearInFlightRequest,
    currentDay,
    forecastCycle,
    isPanelOpen,
    setErrorMessage,
    setPreview,
    setStatus,
  ]);
};

/** Clears stale preview state when the forecast context no longer matches. */
export const useAutoTstmPreviewGuard = ({
  isPanelOpen,
  preview,
  forecastCycle,
  currentDay,
  clearPreview,
  setStatus,
  setErrorMessage,
}: {
  isPanelOpen: boolean;
  preview: PreviewState | null;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  clearPreview: () => void;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
}) => {
  useEffect(() => {
    if (!preview || !isStaleTstmContext(preview.request, forecastCycle, currentDay)) {
      return;
    }
    clearPreview();
    if (isPanelOpen) {
      setErrorMessage(CONTEXT_CHANGED_MESSAGE);
      setStatus('error');
    }
  }, [clearPreview, currentDay, forecastCycle, isPanelOpen, preview, setErrorMessage, setStatus]);
};

/** Aborts any in-flight Auto-TSTM request when the hook unmounts. */
export const useAutoTstmCleanupEffect = (clearInFlightRequest: () => void) => {
  useEffect(() => () => clearInFlightRequest(), [clearInFlightRequest]);
};
