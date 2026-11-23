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
  const serverMs = parseTimestamp(serverTime);
  assertServerTimestamp(serverMs);
  assertRequestInterval(requestStartedAt, responseReceivedAt);

  const offsetMs = serverMs - (requestStartedAt + responseReceivedAt) / 2;
  return {
    offsetMs,
    toServerTime: clientTime => new Date(timestampMs(clientTime) + offsetMs),
    toClientTime: serverDate => new Date(timestampMs(serverDate) - offsetMs),
  };
}

/** Hold the previous progress when a clock correction would cause a large regression. */
export function createMonotonicProgressGuard(tolerance = 0.01): (progress: number, version: string) => number {
  assertTolerance(tolerance);

  const previous: ProgressSnapshot = {};
  return (progress, version) => {
    if (!Number.isFinite(progress)) return lastProgress(previous.progress);
    const next = clampProgress(progress);
    if (shouldAcceptProgress(next, version, previous, tolerance)) {
      previous.progress = next;
      previous.version = version;
    }
    return lastProgress(previous.progress);
  };
}

interface ProgressSnapshot {
  progress?: number;
  version?: string;
}

function parseTimestamp(value: string | Date | number): number {
  if (typeof value === "string") return Date.parse(value);
  if (value instanceof Date) return value.getTime();
  return value;
}

function assertServerTimestamp(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError("serverTime must be a valid timestamp");
}

function assertRequestInterval(start: number, end: number): void {
  if (!Number.isFinite(start)) throw new RangeError("request timestamps must be finite and in chronological order");
  if (!Number.isFinite(end)) throw new RangeError("request timestamps must be finite and in chronological order");
  if (end < start) throw new RangeError("request timestamps must be finite and in chronological order");
}

function assertTolerance(tolerance: number): void {
  if (!Number.isFinite(tolerance)) throw new RangeError("tolerance must be between 0 and 1");
  if (tolerance < 0) throw new RangeError("tolerance must be between 0 and 1");
  if (tolerance > 1) throw new RangeError("tolerance must be between 0 and 1");
}

function shouldAcceptProgress(
  next: number,
  version: string,
  previous: ProgressSnapshot,
  tolerance: number,
): boolean {
  if (previous.progress === undefined) return true;
  if (version !== previous.version) return true;
  return next >= previous.progress - tolerance;
}

function lastProgress(previous: number | undefined): number {
  if (previous === undefined) return 0;
  return previous;
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

function timestampMs(value: Date | number): number {
  let result: number;
  if (value instanceof Date) result = value.getTime();
  else result = value;
  if (!Number.isFinite(result)) throw new RangeError("time must be a valid timestamp");
  return result;
}
