import type { Middleware, UnknownAction } from '@reduxjs/toolkit';

/**
 * Reads the timestamp stamped on an action by the timestamp middleware, or
 * falls back to a live timestamp for direct reducer invocations in tests.
 */
export const readActionTimestamp = (action: UnknownAction): string => {
  const metaTimestamp = (action as { meta?: { timestamp?: string } }).meta?.timestamp;
  return metaTimestamp ?? new Date().toISOString();
};

/**
 * Stamps a deterministic `meta.timestamp` on every dispatched action so
 * reducers never read the clock themselves. Replaying the same action
 * sequence (including the stamped timestamps) reproduces identical output.
 */
export const createTimestampMiddleware = (): Middleware => {
  return () => (next) => (action) => {
    const timestamped = action as UnknownAction & { meta?: { timestamp?: string } };
    if (typeof timestamped.meta?.timestamp !== 'string') {
      return next({
        ...timestamped,
        meta: { ...(timestamped.meta ?? {}), timestamp: new Date().toISOString() },
      });
    }
    return next(action);
  };
};
