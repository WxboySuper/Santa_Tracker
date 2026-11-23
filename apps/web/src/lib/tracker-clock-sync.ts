export interface ClockSync {
  /** Estimated server epoch minus client epoch, in milliseconds. */
  offsetMs: number;
  toServerTime(clientTime: Date | number): Date;
  toClientTime(serverTime: Date | number): Date;
}

/** Estimate clock skew using the midpoint of the request's client-side round trip. */
export function createClockSync(
  serverTime: string | Date | number,
  requestStartedAt: number,
  responseReceivedAt: number,
): ClockSync {
  const serverMs = typeof serverTime === "string"
    ? Date.parse(serverTime)
    : serverTime instanceof Date ? serverTime.getTime() : serverTime;
  if (!Number.isFinite(serverMs)) throw new RangeError("serverTime must be a valid timestamp");
  if (!Number.isFinite(requestStartedAt) || !Number.isFinite(responseReceivedAt) || responseReceivedAt < requestStartedAt) {
    throw new RangeError("request timestamps must be finite and in chronological order");
  }

  const offsetMs = serverMs - (requestStartedAt + responseReceivedAt) / 2;
  return {
    offsetMs,
    toServerTime: clientTime => new Date(timestampMs(clientTime) + offsetMs),
    toClientTime: serverDate => new Date(timestampMs(serverDate) - offsetMs),
  };
}

/** Hold the previous progress when a clock correction would cause a large regression. */
export function createMonotonicProgressGuard(tolerance = 0.01): (progress: number, version: string) => number {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new RangeError("tolerance must be between 0 and 1");
  }

  let previous: number | undefined;
  let previousVersion: string | undefined;
  return (progress, version) => {
    if (!Number.isFinite(progress)) return previous ?? 0;
    const next = Math.min(1, Math.max(0, progress));
    if (previous === undefined || previousVersion !== version || next >= previous - tolerance) {
      previous = next;
      previousVersion = version;
    }
    return previous;
  };
}

function timestampMs(value: Date | number): number {
  const result = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(result)) throw new RangeError("time must be a valid timestamp");
  return result;
}
