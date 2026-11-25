import { haversineKm } from "@santa-tracker/route-engine";
import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";
import { localTimeAt } from "./tracker-local-time";

export interface StopLine {
  node: RouteNode;
  /** Arrival in UTC milliseconds. */
  at: number;
  /** Wall-clock time at the stop when Santa arrives. */
  local: string;
}

export interface JourneyStats {
  done: number;
  total: number;
  countries: number;
  distanceKm: number;
  speedKmh: number | null;
  recent: StopLine[];
  upcoming: StopLine[];
}

function arrival(node: RouteNode): number {
  const stamp = node.schedule?.arrival_utc;
  return stamp ? Date.parse(stamp) : Number.NaN;
}

function departure(node: RouteNode): number {
  const stamp = node.schedule?.departure_utc;
  return stamp ? Date.parse(stamp) : Number.NaN;
}

function line(node: RouteNode): StopLine {
  const at = arrival(node);
  return { node, at, local: localTimeAt(node, at) };
}

/** Distance flown so far: every finished leg, plus the part of the current leg already behind Santa. */
function distanceFlown(timedNodes: RouteNode[], position: SantaPosition | null): number {
  const index = position?.journey.currentIndex;
  if (index == null || !position) return 0;
  let km = 0;
  for (let i = 1; i <= index && i < timedNodes.length; i++) {
    const from = timedNodes[i - 1];
    const to = timedNodes[i];
    if (from && to) km += haversineKm(from.location, to.location);
  }
  const from = timedNodes[index];
  return from ? km + haversineKm(from.location, position) : km;
}

function currentSpeed(timedNodes: RouteNode[], position: SantaPosition | null, now: number): number | null {
  const index = position?.journey.currentIndex;
  if (index == null) return null;
  const from = timedNodes[index];
  const to = timedNodes[index + 1];
  if (!from || !to || now < departure(from)) return 0;
  const hours = (arrival(to) - departure(from)) / 3_600_000;
  return hours > 0 ? Math.round(haversineKm(from.location, to.location) / hours) : null;
}

/** Headline numbers and the recent and upcoming stop lists, all derived from the schedule and the clock. */
export function journeyStats(timedNodes: RouteNode[], position: SantaPosition | null, now: number, listLength = 6): JourneyStats {
  const deliveries = timedNodes.filter(node => node.type === "DELIVERY");
  const reached = deliveries.filter(node => arrival(node) <= now);
  const ahead = deliveries.filter(node => arrival(node) > now);
  const codes = new Set(reached.map(node => (node.location as { country_code?: string }).country_code ?? node.location.region));
  return {
    done: reached.length,
    total: deliveries.length,
    countries: codes.size,
    distanceKm: Math.round(distanceFlown(timedNodes, position)),
    speedKmh: currentSpeed(timedNodes, position, now),
    recent: reached.slice(-listLength).reverse().map(line),
    upcoming: ahead.slice(0, listLength).map(line),
  };
}

export function formatNumber(value: number, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale).format(value);
}
