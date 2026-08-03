import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';

export type TstmFetchResolution =
  | { kind: 'aborted' }
  | { kind: 'stale' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; request: TstmGenerationRequest; response: TstmGenerationResponse };

type ResolveTstmFetchOutcomeInput = {
  request: TstmGenerationRequest;
  activeRequest: TstmGenerationRequest | null;
  response: TstmGenerationResponse | null;
  aborted: boolean;
  error: unknown;
};

/** Resolves a cached Auto-TSTM fetch into a preview-safe outcome. */
export const resolveTstmFetchOutcome = ({
  request,
  activeRequest,
  response,
  aborted,
  error,
}: ResolveTstmFetchOutcomeInput): TstmFetchResolution => {
  if (aborted) {
    return { kind: 'aborted' };
  }
  if (!isCurrentTstmRequest(request, activeRequest ?? request)) {
    return { kind: 'stale' };
  }
  if (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Auto-TSTM guidance is temporarily unavailable.',
    };
  }
  if (!response) {
    return { kind: 'unavailable' };
  }
  return { kind: 'preview', request, response };
};
