export type TstmLatestFailureReason = 'cache_miss' | 'cache_stale' | 'cache_corrupt' | 'unavailable';

const VALID_LATEST_FAILURE_REASONS: readonly TstmLatestFailureReason[] = [
  'cache_miss',
  'cache_stale',
  'cache_corrupt',
  'unavailable',
];

/** Returns true when a string matches a cached Auto-TSTM failure reason. */
const isTstmLatestFailureReason = (value: string): value is TstmLatestFailureReason =>
  VALID_LATEST_FAILURE_REASONS.includes(value as TstmLatestFailureReason);

/** Reads a machine-readable reason from a cached Auto-TSTM API error payload. */
export const readTstmLatestFailureReason = (payload: unknown): TstmLatestFailureReason | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const reason = (payload as { reason?: unknown }).reason;
  if (typeof reason !== 'string' || !isTstmLatestFailureReason(reason)) {
    return null;
  }

  return reason;
};
