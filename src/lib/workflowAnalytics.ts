import { isProductAnalyticsEnabled, trackProductEvent } from './productAnalytics';
import {
  WORKFLOW_ANALYTICS_EVENTS,
  type WorkflowAnalyticsDimensions,
  type WorkflowAnalyticsEvent,
  type WorkflowAnalyticsPayload,
} from '../types/workflowAnalytics';

const DIMENSION_KEYS = ['dayGrouping', 'accountTier', 'entryPath', 'result', 'packageScope', 'action'] as const;
const EVENT_SET = new Set<string>(WORKFLOW_ANALYTICS_EVENTS);
const DIMENSION_VALUES: Record<string, readonly string[]> = {
  dayGrouping: ['day1', 'day2', 'day3', 'day4-8', 'full-cycle'],
  accountTier: ['signed-out', 'free', 'premium'],
  entryPath: ['home', 'forecast', 'cloud-library', 'forecast-workspace', 'rollover'],
  result: ['success', 'failure', 'cancelled'],
  packageScope: ['workflow', 'cycle'],
  action: ['keep', 'save-and-start-new', 'replace-without-saving'],
};
export const WORKFLOW_ANALYTICS_CONSENT_KEY = 'gfc-analytics-enabled';

/** Returns true for a plain object-like record, excluding arrays and null. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns true only for one of the named, low-risk analytics dimensions. */
const isAllowedDimension = (key: string, value: unknown): boolean =>
  DIMENSION_KEYS.includes(key as typeof DIMENSION_KEYS[number])
  && typeof value === 'string'
  && DIMENSION_VALUES[key]?.includes(value) === true;

/** Validates the strict metadata-only payload before it can reach the transport. */
export const validateWorkflowAnalyticsPayload = (value: unknown): value is WorkflowAnalyticsPayload => {
  if (!isRecord(value)) return false;
  if (typeof value.event !== 'string') return false;
  if (!EVENT_SET.has(value.event)) return false;
  if (value.dimensions === undefined) return true;
  if (!isRecord(value.dimensions)) return false;
  return Object.entries(value.dimensions).every(([key, dimension]) => isAllowedDimension(key, dimension));
};

/** Reads the local analytics preference; absence preserves the existing hosted tracking default. */
export const readWorkflowAnalyticsPreference = (): boolean => {
  return isProductAnalyticsEnabled();
};

/** Delivers an already validated payload, falling back when Beacon declines the queue. */
export const sendWorkflowAnalyticsPayload = (payload: WorkflowAnalyticsPayload): void => {
  const eventMap: Record<WorkflowAnalyticsEvent, Parameters<typeof trackProductEvent>[0]> = {
    start: 'workflow_start',
    continue: 'workflow_continue',
    derive: 'workflow_derive',
    revise: 'workflow_revise',
    complete: 'workflow_complete',
    'complete-with-omissions': 'workflow_complete_with_omissions',
    export: 'forecast_exported',
    'rollover-action': 'workflow_rollover_action',
  };
  const event = eventMap[payload.event];
  trackProductEvent(event, payload.dimensions ? { ...payload.dimensions } : undefined);
};

/** Sends a consent-gated event without ever allowing analytics failures into workflow code. */
export const trackWorkflowEvent = (
  event: WorkflowAnalyticsEvent,
  dimensions?: WorkflowAnalyticsDimensions,
  options: { enabled?: boolean; transport?: (payload: WorkflowAnalyticsPayload) => void } = {},
): void => {
  const payload: WorkflowAnalyticsPayload = dimensions ? { event, dimensions } : { event };
  if (options.enabled === false || !readWorkflowAnalyticsPreference() || !validateWorkflowAnalyticsPayload(payload)) return;
  if (options.transport) {
    try { options.transport(payload); } catch { /* analytics must never block forecasting */ }
    return;
  }
  sendWorkflowAnalyticsPayload(payload);
};

export const workflowAnalyticsDimensionKeys = DIMENSION_KEYS;
