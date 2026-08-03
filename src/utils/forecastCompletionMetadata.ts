import type { ForecastCycle } from '../types/outlooks';

export type CompletionMetadata = Pick<ForecastCycle, 'completionAcknowledgedAt' | 'omittedDayReasons' | 'updateInProgressVersion'>;

/** Copies optional completion acknowledgement fields when present. */
export const completionMetadataFromForecastCycle = (
  forecastCycle: CompletionMetadata,
): CompletionMetadata => ({
  ...(forecastCycle.completionAcknowledgedAt
    ? { completionAcknowledgedAt: forecastCycle.completionAcknowledgedAt }
    : {}),
  ...(forecastCycle.omittedDayReasons
    ? { omittedDayReasons: forecastCycle.omittedDayReasons }
    : {}),
  ...(typeof forecastCycle.updateInProgressVersion === 'number'
    ? { updateInProgressVersion: forecastCycle.updateInProgressVersion }
    : {}),
});
