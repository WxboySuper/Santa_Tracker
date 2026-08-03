import { useCallback, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentDay, selectForecastCycle } from '../store/forecastSlice';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { canGenerateTstmForDay } from '../utils/tstmGeneration';

export type AutoTstmStatus = 'idle' | 'loading' | 'preview' | 'error';

export type AutoTstmPreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

/** Owns Auto-TSTM panel state, refs, and reset helpers. */
export const useAutoTstmState = () => {
  const forecastCycle = useSelector(selectForecastCycle);
  const currentDay = useSelector(selectCurrentDay);
  const [status, setStatus] = useState<AutoTstmStatus>('idle');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [preview, setPreview] = useState<AutoTstmPreviewState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<TstmGenerationRequest | null>(null);
  const fetchPreviewRef = useRef<(() => Promise<void>) | null>(null);
  const isDaySupported = canGenerateTstmForDay(currentDay);

  const clearInFlightRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    clearInFlightRequest();
    setPreview(null);
    setErrorMessage(null);
    setStatus('idle');
  }, [clearInFlightRequest]);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    clearPreview();
  }, [clearPreview]);

  return {
    forecastCycle,
    currentDay,
    status,
    isPanelOpen,
    preview,
    errorMessage,
    abortRef,
    activeRequestRef,
    fetchPreviewRef,
    isDaySupported,
    setIsPanelOpen,
    setStatus,
    setErrorMessage,
    setPreview,
    clearInFlightRequest,
    clearPreview,
    closePanel,
  };
};
