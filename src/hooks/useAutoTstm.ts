import type { Feature } from 'geojson';
import { useDispatch } from 'react-redux';
import { useAutoTstmActions } from './useAutoTstmActions';
import {
  useAutoTstmActiveRequestGuard,
  useAutoTstmCleanupEffect,
  useAutoTstmPanelFetchEffect,
  useAutoTstmPreviewGuard,
} from './useAutoTstmEffects';
import { useAutoTstmState } from './useAutoTstmState';

export type { AutoTstmStatus } from './useAutoTstmState';

const EMPTY_FEATURES: Feature[] = [];

/** Orchestrates cached Auto-TSTM preview, apply, cancel, and stale-result protection. */
export const useAutoTstm = () => {
  const dispatch = useDispatch();
  const state = useAutoTstmState();
  const { openPanel, fetchPreview, applyPreview, cancelPreview } = useAutoTstmActions({
    dispatch,
    forecastCycle: state.forecastCycle,
    currentDay: state.currentDay,
    isDaySupported: state.isDaySupported,
    preview: state.preview,
    abortRef: state.abortRef,
    activeRequestRef: state.activeRequestRef,
    clearInFlightRequest: state.clearInFlightRequest,
    clearPreview: state.clearPreview,
    closePanel: state.closePanel,
    setIsPanelOpen: state.setIsPanelOpen,
    setStatus: state.setStatus,
    setErrorMessage: state.setErrorMessage,
    setPreview: state.setPreview,
  });

  state.fetchPreviewRef.current = fetchPreview;

  useAutoTstmPanelFetchEffect(state.isPanelOpen, state.fetchPreviewRef);
  useAutoTstmActiveRequestGuard({
    isPanelOpen: state.isPanelOpen,
    forecastCycle: state.forecastCycle,
    currentDay: state.currentDay,
    activeRequestRef: state.activeRequestRef,
    clearInFlightRequest: state.clearInFlightRequest,
    setPreview: state.setPreview,
    setStatus: state.setStatus,
    setErrorMessage: state.setErrorMessage,
  });
  useAutoTstmPreviewGuard({
    isPanelOpen: state.isPanelOpen,
    preview: state.preview,
    forecastCycle: state.forecastCycle,
    currentDay: state.currentDay,
    clearPreview: state.clearPreview,
    setStatus: state.setStatus,
    setErrorMessage: state.setErrorMessage,
  });
  useAutoTstmCleanupEffect(state.clearInFlightRequest);

  return {
    status: state.status,
    isPanelOpen: state.isPanelOpen,
    isDaySupported: state.isDaySupported,
    previewFeatures: state.preview?.response.features ?? EMPTY_FEATURES,
    previewResponse: state.preview?.response ?? null,
    errorMessage: state.errorMessage,
    openPanel,
    closePanel: state.closePanel,
    fetchPreview,
    applyPreview,
    cancelPreview,
  };
};

export type UseAutoTstmResult = ReturnType<typeof useAutoTstm>;
