import type { Feature } from 'geojson';
import type { DayType } from './outlooks';

export interface TstmGenerationRequest {
  day: DayType;
  cycleDate: string;
  issueDate?: string;
  validDate?: string;
  issuanceTime?: string;
}

export interface TstmGenerationThresholds {
  calibratedThunderCoreProbability: number;
  calibratedThunderSupportProbability: number;
}

export interface TstmGenerationSource {
  product: string;
  search?: string;
  run?: string;
  period?: string;
  forecastHours?: string;
  url?: string;
}

export interface TstmGenerationResponse {
  features: Feature[];
  run: string;
  domain: string;
  forecastHours: number[];
  effectiveStart: string;
  effectiveEnd: string;
  thresholds: TstmGenerationThresholds;
  warnings: string[];
  sources: Record<string, TstmGenerationSource | null>;
  generatedAt: string;
}
