export function clampProgress(firstArrivalMs: number, lastDepartureMs: number, nowMs: number): number {
  const total = lastDepartureMs - firstArrivalMs;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - firstArrivalMs) / total));
}
