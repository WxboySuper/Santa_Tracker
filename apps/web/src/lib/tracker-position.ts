import type { Route } from "@santa-tracker/contracts";
import { deriveJourneyState, findSegment } from "@santa-tracker/route-engine";
import type { RouteNode } from "./locations";
import { routeNodesToContractRoute } from "./route-bridge";

export interface SantaPosition {
  lat: number;
  lng: number;
  journey: ReturnType<typeof deriveJourneyState>;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function nodeLatLng(node: RouteNode): { lat: number; lng: number } {
  return { lat: node.location.lat, lng: node.location.lng };
}

function segmentProgress(route: Route, fromIndex: number, toIndex: number, nowMs: number): number {
  const from = route.stops[fromIndex];
  const to = route.stops[toIndex];
  if (!from || !to) return 0;
  const start = Date.parse(from.departureIso);
  const end = Date.parse(to.arrivalIso);
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
}

export function computeSantaPosition(nodes: RouteNode[], now: Date): SantaPosition | null {
  const { route, timedNodes } = routeNodesToContractRoute(nodes);
  if (route.stops.length === 0 || timedNodes.length === 0) return null;
  const journey = deriveJourneyState(route, now);
  const nowMs = now.getTime();
  const segment = findSegment(route, nowMs);
  return segment
    ? positionOnSegment(route, timedNodes, segment, journey, nowMs)
    : positionAtRouteEndpoint(timedNodes, journey);
}

function positionAtRouteEndpoint(
  timedNodes: ReturnType<typeof routeNodesToContractRoute>["timedNodes"],
  journey: SantaPosition["journey"],
): SantaPosition | null {
  const node = journey.nextIndex === 0
    ? timedNodes.find(hasCoordinates) ?? timedNodes[0]
    : timedNodes[timedNodes.length - 1];
  if (!node) return null;
  const { lat, lng } = nodeLatLng(node);
  return { lat, lng, journey };
}

function positionOnSegment(
  route: Route,
  timedNodes: ReturnType<typeof routeNodesToContractRoute>["timedNodes"],
  segment: NonNullable<ReturnType<typeof findSegment>>,
  journey: SantaPosition["journey"],
  nowMs: number,
): SantaPosition | null {
  const fromNode = timedNodes[segment.currentIndex] ?? timedNodes[0];
  const toNode = segment.nextIndex != null ? timedNodes[segment.nextIndex] : fromNode;
  if (!fromNode || !toNode) return null;
  const from = nodeLatLng(fromNode);
  const to = nodeLatLng(toNode);
  const t = segment.nextIndex != null ? segmentProgress(route, segment.currentIndex, segment.nextIndex, nowMs) : 0;
  return {
    lat: lerp(from.lat, to.lat, t),
    lng: lerp(from.lng, to.lng, t),
    journey,
  };
}

function hasCoordinates(node: RouteNode): boolean {
  return Number.isFinite(node.location.lat) && Number.isFinite(node.location.lng);
}
