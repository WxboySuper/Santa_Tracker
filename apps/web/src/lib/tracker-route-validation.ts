import type { RouteNode } from "./locations";

export function validRouteNodes(value: unknown): RouteNode[] {
  if (!Array.isArray(value)) throw new Error("Invalid route");
  const nodes = value.filter(isRouteNode);
  if (nodes.length === 0) throw new Error("Invalid route");
  return nodes;
}

function isRouteNode(value: unknown): value is RouteNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  if (typeof node.id !== "string") return false;
  if (typeof node.location !== "object" || node.location === null || Array.isArray(node.location)) return false;
  const location = node.location as Record<string, unknown>;
  if (typeof location.name !== "string") return false;
  if (typeof location.lat !== "number" || !Number.isFinite(location.lat)) return false;
  if (typeof location.lng !== "number" || !Number.isFinite(location.lng)) return false;
  return true;
}
