import type { RouteNode } from "./locations";

export function validRouteNodes(value: unknown): RouteNode[] {
  if (!Array.isArray(value)) throw new Error("Invalid route");
  const nodes = value.filter(isRouteNode);
  if (nodes.length === 0) throw new Error("Invalid route");
  return nodes;
}

function isRouteNode(value: unknown): value is RouteNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.type !== "string") return false;
  return hasValidLocation(value.location);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return false;
  return true;
}

function hasValidLocation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (!isFiniteNumber(value.lat)) return false;
  if (!isFiniteNumber(value.lng)) return false;
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  if (typeof value !== "number") return false;
  return Number.isFinite(value);
}
