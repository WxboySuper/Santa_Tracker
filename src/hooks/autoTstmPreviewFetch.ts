import type { MutableRefObject } from 'react';
import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import { requestLatestTstmData } from '../utils/tstmGeneration';
import { resolveTstmFetchOutcome } from './autoTstmFetch';
import type { AutoTstmStatus } from './useAutoTstmState';

type PreviewState = {
  request: TstmGenerationRequest;
  response: TstmGenerationResponse;
};

const UNAVAILABLE_MESSAGE =
  'No cached Auto-TSTM guidance is available for this day yet. Try again after the next ingestion cycle.';

/** Applies a fetch resolution to preview UI state when it is actionable. */
const applyFetchOutcome = (
  outcome: ReturnType<typeof resolveTstmFetchOutcome>,
  setPreview: (value: PreviewState | null) => void,
  setStatus: (value: AutoTstmStatus) => void,
  setErrorMessage: (value: string | null) => void,
): void => {
  if (outcome.kind === 'aborted' || outcome.kind === 'stale') {
    return;
  }
  if (outcome.kind === 'unavailable') {
    setPreview(null);
    setStatus('error');
    setErrorMessage(UNAVAILABLE_MESSAGE);
    return;
  }
  if (outcome.kind === 'error') {
    setPreview(null);
    setStatus('error');
    setErrorMessage(outcome.message);
    return;
  }
  setPreview({ request: outcome.request, response: outcome.response });
  setStatus('preview');
};

type RunAutoTstmPreviewFetchArgs = {
  isDaySupported: boolean;
  forecastCycle: ForecastCycle;
  currentDay: DayType;
  clearInFlightRequest: () => void;
  abortRef: MutableRefObject<AbortController | null>;
  activeRequestRef: MutableRefObject<TstmGenerationRequest | null>;
  setStatus: (value: AutoTstmStatus) => void;
  setErrorMessage: (value: string | null) => void;
  setPreview: (value: PreviewState | null) => void;
};

/** Fetches cached Auto-TSTM guidance and updates preview state when the response is still current. */
export const runAutoTstmPreviewFetch = async ({
  isDaySupported,
  forecastCycle,
  currentDay,
  clearInFlightRequest,
  abortRef,
  activeRequestRef,
  setStatus,
  setErrorMessage,
  setPreview,
}: RunAutoTstmPreviewFetchArgs): Promise<void> => {
  if (!isDaySupported) {
    return;
  }

  const request = buildTstmRequest(forecastCycle, currentDay);
  clearInFlightRequest();
  const controller = new AbortController();
  abortRef.current = controller;
  activeRequestRef.current = request;
  setStatus('loading');
  setErrorMessage(null);
  setPreview(null);

  try {
    const response = await requestLatestTstmData(currentDay, 'full', controller.signal);
    applyFetchOutcome(
      resolveTstmFetchOutcome({
        request,
        activeRequest: activeRequestRef.current,
        response,
        aborted: controller.signal.aborted,
        error: null,
      }),
      setPreview,
      setStatus,
      setErrorMessage,
    );
  } catch (error) {
    applyFetchOutcome(
      resolveTstmFetchOutcome({
        request,
        activeRequest: activeRequestRef.current,
        response: null,
        aborted: controller.signal.aborted,
        error,
      }),
      setPreview,
      setStatus,
      setErrorMessage,
    );
  } finally {
    if (abortRef.current === controller) {
      abortRef.current = null;
    }
  }
};
