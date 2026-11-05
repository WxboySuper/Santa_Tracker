/**
 * When each public feature is open to visitors. Pure: no I/O, no clock.
 *
 * Outside its window a feature is hidden from the public (pages and APIs answer 404). Admin
 * sessions bypass the gate so the owner can preview, see `access.ts`.
 *
 * Windows follow the planning doc's default annual schedule:
 *  - Advent: opens Nov 30 00:00 UTC (a day before Day 1, so the calendar exists wherever Dec 1
 *    arrives first) and stays through the post-flight period.
 *  - Tracker: opens 10 minutes before takeoff (Dec 24 10:00 UTC) so it is ready the moment the
 *    countdown ends, and stays through the post-flight replay period.
 *  - Both close at Jan 7 00:00 UTC and stay hidden until the next season.
 */

export type SeasonFeature = "tracker" | "advent";
export type FeatureAccess = "open" | "admin" | "closed";

const MINUTE_MS = 60_000;

/** The tracker opens this long before takeoff. */
export const TRACKER_LEAD_MS = 10 * MINUTE_MS;

function takeoff(year: number): number {
  return Date.UTC(year, 11, 24, 10, 0, 0);
}

/** [start, end) in epoch ms for one season, keyed by the year its December falls in. */
function windowFor(feature: SeasonFeature, year: number): readonly [number, number] {
  const end = Date.UTC(year + 1, 0, 7, 0, 0, 0);
  const start = feature === "tracker" ? takeoff(year) - TRACKER_LEAD_MS : Date.UTC(year, 10, 30, 0, 0, 0);
  return [start, end];
}

/** Whether `feature` is open to the public at `now`. */
export function isFeatureOpen(feature: SeasonFeature, now: Date): boolean {
  const t = now.getTime();
  const year = now.getUTCFullYear();
  // The post-flight period crosses New Year, so Jan 1-6 belongs to the previous year's season.
  return [year - 1, year].some((candidate) => {
    const [start, end] = windowFor(feature, candidate);
    return t >= start && t < end;
  });
}

/** Combine the public window with an admin session into one decision. */
export function resolveAccess(open: boolean, isAdmin: boolean): FeatureAccess {
  if (open) return "open";
  return isAdmin ? "admin" : "closed";
}
