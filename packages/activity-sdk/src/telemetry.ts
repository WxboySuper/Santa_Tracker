/** Privacy-limited completion or failure event emitted by an activity. */
export type ActivityTelemetry = { activityId: string; event: 'completed' | 'failed'; score?: number; durationMs?: number; reason?: string };
/** Optional fields accepted by {@link completionEvent}. */
export type CompletionDetails = Pick<ActivityTelemetry, 'score' | 'durationMs'>;
/** Optional fields accepted by {@link failureEvent}. */
export type FailureDetails = Pick<ActivityTelemetry, 'durationMs' | 'reason'>;

function sanitizeScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sanitizeReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const reason = value.trim();
  return reason.length > 0 ? reason : undefined;
}

function requireActivityId(activityId: unknown): string {
  if (typeof activityId !== 'string' || activityId.trim().length === 0) {
    throw new Error('activityId must be a non-empty string');
  }
  return activityId.trim();
}

function baseDetails(details: unknown): Record<string, unknown> {
  return typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {};
}

/** Builds a completion event, keeping only finite score and non-negative duration values. */
export function completionEvent(activityId: string, details: CompletionDetails | null | undefined = {}): ActivityTelemetry {
  const id = requireActivityId(activityId);
  const source = baseDetails(details);
  const result: ActivityTelemetry = { activityId: id, event: 'completed' };
  const score = sanitizeScore(source.score);
  const durationMs = sanitizeDuration(source.durationMs);
  if (score !== undefined) result.score = score;
  if (durationMs !== undefined) result.durationMs = durationMs;
  return result;
}

/** Builds a failure event with a trimmed reason and non-negative duration. */
export function failureEvent(activityId: string, details: FailureDetails | null | undefined = {}): ActivityTelemetry {
  const id = requireActivityId(activityId);
  const source = baseDetails(details);
  const result: ActivityTelemetry = { activityId: id, event: 'failed' };
  const durationMs = sanitizeDuration(source.durationMs);
  const reason = sanitizeReason(source.reason);
  if (durationMs !== undefined) result.durationMs = durationMs;
  if (reason !== undefined) result.reason = reason;
  return result;
}
