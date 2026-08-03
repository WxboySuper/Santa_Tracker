export const WORKFLOW_ANALYTICS_EVENTS = [
  'start',
  'continue',
  'derive',
  'revise',
  'complete',
  'complete-with-omissions',
  'export',
  'rollover-action',
] as const;

export type WorkflowAnalyticsEvent = (typeof WORKFLOW_ANALYTICS_EVENTS)[number];
export type WorkflowAnalyticsResult = 'success' | 'failure' | 'cancelled';
export type WorkflowAnalyticsPackageScope = 'workflow' | 'cycle';

export interface WorkflowAnalyticsDimensions {
  dayGrouping?: 'day1' | 'day2' | 'day3' | 'day4-8' | 'full-cycle';
  accountTier?: 'signed-out' | 'free' | 'premium';
  entryPath?: 'home' | 'forecast' | 'cloud-library' | 'forecast-workspace' | 'rollover';
  result?: WorkflowAnalyticsResult;
  packageScope?: WorkflowAnalyticsPackageScope;
  action?: 'keep' | 'save-and-start-new' | 'replace-without-saving';
}

export interface WorkflowAnalyticsPayload {
  event: WorkflowAnalyticsEvent;
  dimensions?: WorkflowAnalyticsDimensions;
}
