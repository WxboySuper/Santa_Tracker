import type { Feature } from 'geojson';

/**
 * Defines the types for GFC's severe weather outlook system
 * Based on the specifications in docs/product/outlook-info.md
 */

// Categorical risk levels
export type CategoricalRiskLevel = 
  | 'TSTM' // General Thunderstorm (0/5)
  | 'MRGL' // Marginal (1/5)
  | 'SLGT' // Slight (2/5)
  | 'ENH'  // Enhanced (3/5)
  | 'MDT'  // Moderate (4/5)
  | 'HIGH'; // High (5/5)

// Probabilistic risk levels for Tornado
export type TornadoProbability = 
  | '2%'
  | '5%'
  | '10%'
  | '15%'
  | '30%'
  | '45%'
  | '60%';

// Wind Probability
export type WindProbability = 
  | '5%'
  | '15%'
  | '30%'
  | '45%'
  | '60%'
  | '75%'
  | '90%';

// Hail Probability
export type HailProbability = 
  | '5%'
  | '15%'
  | '30%'
  | '45%'
  | '60%';

// Day 3 Total Severe Probability (combined threat, not separate tornado/wind/hail)
export type TotalSevereProbability =
  | '5%'
  | '15%'
  | '30%'
  | '45%'
  | '60%';

// Day 4-8 Probability (special outlook type with only 15% and 30%)
export type Day48Probability =
  | '15%' // Yellow
  | '30%'; // Orange

// CIG (Hatching) Levels
export type CIGLevel = 
  | 'CIG0' // No hatching
  | 'CIG1' // Old Hatching Style (Broken diagonal)
  | 'CIG2' // Solid diagonal (Top-Left to Bottom-Right)
  | 'CIG3'; // Crosshatch

// Outlook types - varies by day
// Day 1/2: tornado, wind, hail, categorical
// Day 3: totalSevere, categorical  
// Day 4-8: day4-8
export type OutlookType = 'tornado' | 'wind' | 'hail' | 'categorical' | 'totalSevere' | 'day4-8';

// Combined probability type for use across the app
export type Probability = TornadoProbability | WindProbability | HailProbability | TotalSevereProbability | Day48Probability | CategoricalRiskLevel | CIGLevel;

export type Hazard = OutlookType;

export interface RiskArea extends Feature {
  properties: {
    outlookType: OutlookType;
    probability: Probability;
    isSignificant: boolean;
    derivedFrom?: string;
    originalProbability?: string;
    [key: string]: any;
  };
  id?: string | number;
}

export interface Outlook {
  type: Hazard;
  riskAreas: RiskArea[];
}

// Full outlook data structure - adapts based on day
// Day 1/2: tornado, wind, hail, categorical
// Day 3: totalSevere, categorical
// Day 4-8: day4-8 only
export interface OutlookData {
  // Day 1 & 2 fields
  tornado?: Map<string, Feature[]>;
  wind?: Map<string, Feature[]>;
  hail?: Map<string, Feature[]>;
  
  // Day 3 field
  totalSevere?: Map<string, Feature[]>;
  
  // Day 1, 2, 3 field (with categorical conversion)
  categorical?: Map<string, Feature[]>;
  
  // Day 4-8 field (15% and 30% only, no categorical)
  'day4-8'?: Map<string, Feature[]>;
}

// Color mappings for the different outlook types
export interface ColorMappings {
  tornado: Record<TornadoProbability, string>;
  wind: Record<WindProbability, string>;
  hail: Record<HailProbability, string>;
  totalSevere: Record<TotalSevereProbability, string>;
  'day4-8': Record<Day48Probability, string>;
  categorical: Record<CategoricalRiskLevel, string>;
  significant: string; // For the hatched pattern
  hatching: Record<CIGLevel, string>; // Pattern defs or colors (transparent usually)
}

// Drawing tool state
export interface DrawingState {
  activeOutlookType: OutlookType;
  activeProbability: Probability;
  isSignificant: boolean; // Whether the current drawing should be hatched (Legacy)
}

// Serialization types for JSON storage
export interface SerializedOutlookData {
  tornado?: [string, Feature[]][];
  wind?: [string, Feature[]][];
  hail?: [string, Feature[]][];
  totalSevere?: [string, Feature[]][];
  'day4-8'?: [string, Feature[]][];
  categorical?: [string, Feature[]][];
}

// Forecast Cycle Types
// Individual days instead of merged '4-8'
export type DayType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Discussion Editor Types
export type DiscussionMode = 'diy' | 'guided';

export interface GuidedDiscussionData {
  synopsis: string;
  meteorologicalSetup: string;
  severeWeatherExpectations: string;
  timing: string;
  regionalBreakdown: string;
  additionalConsiderations: string;
}

export interface DiscussionData {
  mode: DiscussionMode;
  validStart: string; // ISO date-time
  validEnd: string; // ISO date-time
  forecasterName: string;

  // DIY mode - simple text editor
  diyContent?: string;

  // Guided mode - structured questions
  guidedContent?: GuidedDiscussionData;

  lastModified: string;
}

/** A discussion scope. Content remains canonical on one legacy day slot. */
export interface DiscussionGrouping {
  id: string;
  label: string;
  days: DayType[];
  discussionDay: DayType;
}

export interface OutlookDay {
  day: DayType;
  data: OutlookData; // The actual polygon data
  /** Self-contained custom layers kept outside severe-weather outlook maps. */
  customLayers?: import('./customProducts').CustomLayerCollection;
  metadata: {
    issueDate: string;
    validDate: string;
    issuanceTime: string;
    createdAt: string;
    lastModified: string;
    lowProbabilityOutlooks?: OutlookType[];
  };
  discussion?: DiscussionData; // Optional discussion for this day
}

export interface ForecastCycle {
  days: Partial<Record<DayType, OutlookDay>>;
  currentDay: DayType;
  cycleDate: string;
  /** Optional workflow discussion scopes; legacy content stays on OutlookDay.discussion. */
  discussionGroupings?: DiscussionGrouping[];
  /** ISO timestamp when the forecaster acknowledged completion with omissions. */
  completionAcknowledgedAt?: string;
  /** User-provided reasons for omitted forecast days at completion time. */
  omittedDayReasons?: Partial<Record<DayType, string>>;
  /** Active same-day workflow update version that has not been reviewed yet. */
  updateInProgressVersion?: number;
}

// Updated Save Data Interface
export interface GFCForecastSaveData {
  version: string;
  type: 'single-day' | 'forecast-cycle';
  timestamp: string;
  
  // Single day format (backward compatible / single export)
  outlooks?: SerializedOutlookData;
  mapView?: {
    center: [number, number];
    zoom: number;
  };

  // Multi-day format (new)
  forecastCycle?: {
    days: Partial<Record<DayType, {
      day: DayType;
      data: SerializedOutlookData;
      customLayers?: import('./customProducts').CustomLayerCollection;
      metadata: {
        issueDate: string;
        validDate: string;
        issuanceTime: string;
        lowProbabilityOutlooks?: OutlookType[];
      };
    }>>;
    currentDay: DayType;
    cycleDate: string;
    discussionGroupings?: DiscussionGrouping[];
    completionAcknowledgedAt?: string;
    omittedDayReasons?: Partial<Record<DayType, string>>;
    updateInProgressVersion?: number;
  };

  /** Optional v2 workflow cycle metadata embedded in v1.0.0 saves. Null clears an active workflow on load. */
  cycleMetadata?: import('./workflow').CycleMetadata | null;
}

// ---------------------------------------------------------------------------
// Workflow v2 re-exports (issue #451 / WF-01)
// ---------------------------------------------------------------------------

export type {
  WorkflowId,
  CycleId,
  CycleStatus,
  OutlookStatus,
  OutlookVersion,
  StandardGrouping,
  CustomGrouping,
  Grouping,
  WorkflowMetadata,
  CycleMetadata,
  WorkflowPackageMetadata,
  Package,
  SerializedOutlookVersionData,
  SerializedCycle,
  SerializedWorkflowPackage,
  ValidationOutlookType,
  ValidationSeverity,
  ValidationIssue,
  CycleValidationResult,
} from './workflow';

export { WORKFLOW_SCHEMA_VERSION, createCustomGrouping } from './workflow';
