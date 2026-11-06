"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "ol/ol.css";
import { createTranslator } from "@santa-tracker/localization";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import { mapModeReducer, type TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { useMapAdapter } from "./tracker-map-hooks";
import { trackerViewMode, type TrackerViewMode } from "@/lib/tracker-view-mode";
import { useRouteNodes, useSantaPosition } from "./tracker-map-data-hooks";
import { TrackerMapView } from "./tracker-map-view";

interface TrackerMapProps { adventEnabled: boolean; locale: string }

export default function TrackerMap({ adventEnabled, locale }: TrackerMapProps) {
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const element = useRef<HTMLDivElement>(null);
  const adapter = useRef<TrackerMapAdapter | null>(null);
  const [mode, dispatch] = useReducer(mapModeReducer, "vector");
  const [nodes, status] = useRouteNodes(translator);
  const position = useSantaPosition(nodes);
  const [following, setFollowing] = useState(true);
  const [viewMode, setViewMode] = useState<TrackerViewMode>("standard");
  useEffect(() => {
    const sync = () => setViewMode(trackerViewMode(new URLSearchParams(window.location.search).get("mode")));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const toggleImmersive = useCallback(() => {
    const next = viewMode === "immersive" ? "standard" : "immersive";
    setViewMode(next);
    const url = new URL(window.location.href);
    if (next === "immersive") url.searchParams.set("mode", next);
    else url.searchParams.delete("mode");
    window.history.replaceState({}, "", url);
    if (next === "immersive") void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [viewMode]);
  const stopFollowing = useCallback(() => setFollowing(false), []);
  useMapAdapter({ mode, element, nodes, position, dispatch, stopFollowing, adapter });
  const timedNodes = routeNodesToContractRoute(nodes).timedNodes;
  const currentIndex = position?.journey.currentIndex;
  const current = currentIndex == null ? undefined : timedNodes[currentIndex];
  return <TrackerMapView
    adventEnabled={adventEnabled}
    locale={locale}
    translator={translator}
    element={element}
    adapter={adapter}
    mode={mode}
    dispatch={dispatch}
    nodes={nodes}
    position={position}
    current={current}
    status={status}
    following={following}
    setFollowing={setFollowing}
    viewMode={viewMode}
    setViewMode={setViewMode}
    toggleImmersive={toggleImmersive}
  />;
}
