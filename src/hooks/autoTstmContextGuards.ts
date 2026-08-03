import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest } from '../types/tstmGeneration';
import { buildTstmRequest } from '../utils/buildTstmRequest';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';

export const CONTEXT_CHANGED_MESSAGE =
  'Forecast context changed. Fetch guidance again for the current day and cycle.';

/** Returns true when a stored TSTM request no longer matches the active forecast context. */
export const isStaleTstmContext = (
  request: TstmGenerationRequest,
  forecastCycle: ForecastCycle,
  currentDay: DayType,
): boolean => !isCurrentTstmRequest(request, buildTstmRequest(forecastCycle, currentDay));

/** Returns true when an in-flight TSTM request is stale for the current forecast context. */
export const isStaleActiveTstmRequest = (
  activeRequest: TstmGenerationRequest | null,
  forecastCycle: ForecastCycle,
  currentDay: DayType,
): boolean => activeRequest !== null && isStaleTstmContext(activeRequest, forecastCycle, currentDay);
