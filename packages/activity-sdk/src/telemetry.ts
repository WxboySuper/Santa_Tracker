export type ActivityTelemetry = { activityId: string; event: 'completed' | 'failed'; score?: number; durationMs?: number; reason?: string };
export function completionEvent(activityId: string, details: Omit<ActivityTelemetry, 'activityId' | 'event'> = {}): ActivityTelemetry { return { activityId, event: 'completed', ...details }; }
export function failureEvent(activityId: string, details: Omit<ActivityTelemetry, 'activityId' | 'event'> = {}): ActivityTelemetry { return { activityId, event: 'failed', ...details }; }
