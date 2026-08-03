import type { Dispatch } from '@reduxjs/toolkit';
import { replaceTstmFeatures } from '../store/forecastSlice';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';
import type { AutoTstmStatus } from './useAutoTstmState';

export type AutoTstmPreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const STALE_APPLY_MESSAGE =
  'This guidance is stale because the forecast day or cycle changed. Fetch again before applying.';

/** Commits the current Auto-TSTM preview when it still matches the active forecast context. */
export const commitAutoTstmPreview = ({
  preview,
  forecastCycle,
  currentDay,
  dispatch,
  clearPreview,
  closePanel,
  setErrorMessage,
  setStatus,
}: {
  preview: AutoTstmPreviewState;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  dispatch: Dispatch;
  clearPreview: () => void;
  closePanel: () => void;
  setErrorMessage: (value: string | null) => void;
  setStatus: (value: AutoTstmStatus) => void;
}): void => {
  const activeRequest = buildTstmRequest(forecastCycle, currentDay);
  if (!isCurrentTstmRequest(preview.request, activeRequest)) {
    clearPreview();
    setErrorMessage(STALE_APPLY_MESSAGE);
    setStatus('error');
    return;
  }

  if (preview.response.features.length === 0) {
    return;
  }

  dispatch(replaceTstmFeatures({ features: preview.response.features }));
  closePanel();
};
