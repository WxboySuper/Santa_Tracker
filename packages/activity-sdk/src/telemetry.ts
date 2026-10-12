export type ActivityTelemetry = { activityId: string; event: 'completed' | 'failed'; score?: number; durationMs?: number; reason?: string };
export type CompletionDetails = Pick<ActivityTelemetry, 'score' | 'durationMs'>;
export type FailureDetails = Pick<ActivityTelemetry, 'durationMs' | 'reason'>;

function sanitizeScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sanitizeReason(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireActivityId(activityId: unknown): string {
  if (typeof activityId !== 'string' || activityId.trim().length === 0) {
    throw new Error('activityId must be a non-empty string');
  }
  return activityId;
}

function baseDetails(details: unknown): Record<string, unknown> {
  return typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {};
}

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
