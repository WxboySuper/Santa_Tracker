import { useEffect, useMemo, useState } from "react";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import { computeSantaPosition, type SantaPosition } from "@/lib/tracker-position";
import { validRouteNodes } from "@/lib/tracker-route-validation";
import { useTrackerNow } from "@/lib/use-tracker-now";

type Translator = ReturnType<typeof createTranslator>;

/** Loads the route. `source` defaults to the live route API; the route demo points it at a draft route. */
export function useRouteNodes(translator: Translator, source = "/api/route"): [RouteNode[], string] {
  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [status, setStatus] = useState(translator.t("tracker.loading"));
  useEffect(() => {
    const controller = new AbortController();
    fetch(source, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Route request failed");
      const data: { route_nodes: unknown } = await response.json();
      const routeNodes = validRouteNodes(data.route_nodes);
      setNodes(routeNodes);
      setStatus(translator.t("tracker.loaded", { count: routeNodes.length }));
    }).catch(() => {
      if (!controller.signal.aborted) setStatus(translator.t("tracker.unavailable"));
    });
    return () => controller.abort();
  }, [source, translator]);
  return [nodes, status];
}

export function useSantaPosition(nodes: RouteNode[]): SantaPosition | null {
  const now = useTrackerNow();
  return useMemo(() => computeSantaPosition(nodes, now), [nodes, now]);
}
