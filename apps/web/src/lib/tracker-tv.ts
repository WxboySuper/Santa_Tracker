import type { RouteNode } from "./locations";
import type { ChosenPlace } from "./tracker-arrival";
import { estimateArrival } from "./tracker-arrival";

export interface TvStop {
  id: string;
  name: string;
  arrival: Date | null;
  localArrival: string;
}

export interface TvDashboardData {
  current: RouteNode | null;
  nextStops: TvStop[];
  progressPercent: number;
  santaLocalTime: string;
  visitorArrival: Date | null;
}

export interface TvDashboardInput {
  nodes: RouteNode[];
  currentIndex: number | null;
  progress: number;
  place: ChosenPlace | null;
  now: Date;
  locale: string;
}

export interface NextRouteStopsInput {
  nodes: RouteNode[];
  currentIndex: number | null;
  now: Date;
  locale: string;
  count?: number;
}

/** Derives the TV dashboard from the route and one injected clock value. */
export function deriveTvDashboard({ nodes, currentIndex, progress, place, now, locale }: TvDashboardInput): TvDashboardData {
  const current = currentIndex === null ? null : nodes[currentIndex] ?? null;
  const nextStops = nextRouteStops({ nodes, currentIndex, now, locale });
  const visitorArrival = place ? estimateArrival(place, nodes, now)?.at ?? null : null;
  return {
    current,
    nextStops,
    progressPercent: Math.round(Math.min(1, Math.max(0, progress)) * 100),
    santaLocalTime: formatLocalClock(now, current?.location.timezone_offset ?? 0, locale),
    visitorArrival,
  };
}

/** Returns the next three scheduled stops after the current route index. */
export function nextRouteStops({ nodes, currentIndex, now, locale, count = 3 }: NextRouteStopsInput): TvStop[] {
  return nodes
    .slice(Math.max(0, (currentIndex ?? -1) + 1))
    .filter(node => hasFutureArrival(node, now))
    .slice(0, Math.max(0, count))
    .map(node => toTvStop(node, locale));
}

function hasFutureArrival(node: RouteNode, now: Date): boolean {
  const arrival = Date.parse(node.schedule?.arrival_utc ?? "");
  return Number.isFinite(arrival) && arrival >= now.getTime();
}

function toTvStop(node: RouteNode, locale: string): TvStop {
  const timestamp = Date.parse(node.schedule?.arrival_utc ?? "");
  const arrival = Number.isFinite(timestamp) ? new Date(timestamp) : null;
  return {
    id: node.id,
    name: node.location.name,
    arrival,
    localArrival: arrival ? formatLocalClock(arrival, node.location.timezone_offset ?? 0, locale) : "",
  };
}

function formatLocalClock(instant: Date, offsetHours: number, locale: string): string {
  const shifted = new Date(instant.getTime() + offsetHours * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(shifted);
}
