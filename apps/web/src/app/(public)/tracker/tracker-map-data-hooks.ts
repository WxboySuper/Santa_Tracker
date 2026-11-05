import { useEffect, useState } from "react";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import { computeSantaPosition, type SantaPosition } from "@/lib/tracker-position";

type Translator = ReturnType<typeof createTranslator>;

export function useRouteNodes(translator: Translator): [RouteNode[], string] {
  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [status, setStatus] = useState(translator.t("tracker.loading"));
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/route", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Route request failed");
      const data: { route_nodes: RouteNode[] } = await response.json();
      if (!Array.isArray(data.route_nodes)) throw new Error("Invalid route");
      setNodes(data.route_nodes);
      setStatus(translator.t("tracker.loaded", { count: data.route_nodes.length }));
    }).catch(() => {
      if (!controller.signal.aborted) setStatus(translator.t("tracker.unavailable"));
    });
    return () => controller.abort();
  }, [translator]);
  return [nodes, status];
}

export function useSantaPosition(nodes: RouteNode[]): SantaPosition | null {
  const [position, setPosition] = useState<SantaPosition | null>(null);
  useEffect(() => {
    const tick = () => setPosition(computeSantaPosition(nodes, new Date()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nodes]);
  return position;
}
