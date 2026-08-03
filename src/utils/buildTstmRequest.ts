import type { DayType, ForecastCycle } from '../types/outlooks';
import type { TstmGenerationRequest } from '../types/tstmGeneration';

/** Builds the forecast-context identity used to fetch and validate Auto-TSTM guidance. */
export const buildTstmRequest = (cycle: ForecastCycle, day: DayType): TstmGenerationRequest => {
  const dayData = cycle.days[day];
  const metadata = dayData?.metadata;

  return {
    day,
    cycleDate: cycle.cycleDate,
    issueDate: metadata?.issueDate,
    validDate: metadata?.validDate,
    issuanceTime: metadata?.issuanceTime,
  };
};
