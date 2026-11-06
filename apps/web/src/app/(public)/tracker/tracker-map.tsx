"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "ol/ol.css";
import { createTranslator } from "@santa-tracker/localization";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import { mapModeReducer, type TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { useMapAdapter } from "./tracker-map-hooks";
import { useTrackerViewMode } from "@/lib/tracker-view-mode";
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
  const { viewMode, toggleImmersive, toggleTv } = useTrackerViewMode();
  useEffect(() => {
    if (viewMode !== "tv") return;
    if (mode === "text") dispatch("showMap");
    setFollowing(true);
    adapter.current?.follow();
  }, [adapter, dispatch, mode, viewMode]);
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
    toggleImmersive={toggleImmersive}
    toggleTv={toggleTv}
  />;
}
