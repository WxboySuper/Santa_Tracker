"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import "ol/ol.css";
import { createTranslator } from "@santa-tracker/localization";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import { mapModeReducer, type TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { useMapAdapter, type MapEvent, type MapMode } from "./tracker-map-hooks";
import { useTrackerViewMode } from "@/lib/tracker-view-mode";
import { useRouteNodes, useSantaPosition } from "./tracker-map-data-hooks";
import { TrackerMapView } from "./tracker-map-view";
import { DEFAULT_TRACKER_LAYOUT, type TrackerLayoutId } from "@/lib/tracker-layout";
import { DEFAULT_TRACKER_THEME, setActiveTrackerTheme, themeFontsHref, trackerTheme, type TrackerThemeId } from "@/lib/tracker-theme";

interface TrackerMapProps { adventEnabled: boolean; locale: string; routeSource?: string; theme?: TrackerThemeId; layout?: TrackerLayoutId }
interface TvModeContext {
  session: { current: { mode: MapMode; following: boolean } | null };
  mode: MapMode;
  following: boolean;
  setFollowing: (value: boolean) => void;
  dispatch: Dispatch<MapEvent>;
  adapter: { current: TrackerMapAdapter | null };
}

export default function TrackerMap({ adventEnabled, locale, routeSource, theme = DEFAULT_TRACKER_THEME, layout = DEFAULT_TRACKER_LAYOUT }: TrackerMapProps) {
  // The map adapter reads the active theme when it mounts; the page remounts TrackerMap to change theme.
  setActiveTrackerTheme(theme);
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const element = useRef<HTMLDivElement>(null);
  const adapter = useRef<TrackerMapAdapter | null>(null);
  const [mode, dispatch] = useReducer(mapModeReducer, "vector");
  const [nodes, status] = useRouteNodes(translator, routeSource);
  const position = useSantaPosition(nodes);
  const [following, setFollowing] = useState(true);
  const tvSession = useRef<{ mode: MapMode; following: boolean } | null>(null);
  const { viewMode, toggleImmersive, toggleTv } = useTrackerViewMode();
  const [globeFailed, setGlobeFailed] = useState(false);
  const onGlobeUnavailable = useCallback(() => setGlobeFailed(true), []);
  // The globe replaces the flat map (not in TV mode, and not if WebGL is unavailable, when the single card is used).
  const globe = layout === "globe" && !globeFailed && viewMode !== "tv";
  const shownLayout: TrackerLayoutId = layout === "globe" && !globe ? "card" : layout;
  useEffect(() => {
    const context = { session: tvSession, mode, following, setFollowing, dispatch, adapter };
    if (viewMode === "tv") {
      const shouldShowMap = enterTvMode(context);
      if (shouldShowMap) dispatch("showMap");
      return;
    }
    restoreTrackerMode(context);
  }, [adapter, dispatch, following, mode, viewMode]);
  const stopFollowing = useCallback(() => setFollowing(false), []);
  // While the globe is up the flat map adapter stays idle ("text" means no interactive map to mount).
  useMapAdapter({ mode: globe ? "text" : mode, element, nodes, position, dispatch, stopFollowing, adapter });
  const timedNodes = routeNodesToContractRoute(nodes).timedNodes;
  const currentIndex = position?.journey.currentIndex;
  const current = currentIndex == null ? undefined : timedNodes[currentIndex];
  return <div className={`tt-root tt-${theme} tl-layout-${shownLayout}`}>
    <link rel="stylesheet" href={themeFontsHref(trackerTheme(theme))} precedence="default" />
    <TrackerMapView
    theme={theme}
    layout={shownLayout}
    globe={globe}
    onGlobeUnavailable={onGlobeUnavailable}
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
  />
  </div>;
}

function enterTvMode({ session, mode, following, setFollowing, adapter }: TvModeContext): boolean {
  if (session.current) return false;
  session.current = { mode, following };
  setFollowing(true);
  adapter.current?.follow();
  return mode === "text";
}

function restoreTrackerMode({ session, mode, setFollowing, dispatch, adapter }: TvModeContext): void {
  const previous = session.current;
  if (!previous) return;
  session.current = null;
  // Only undo the map we forced for a text-mode visitor; a map that degraded during TV stays as it is.
  if (previous.mode === "text" && mode !== "text") dispatch(modeEvent(previous.mode));
  setFollowing(previous.following);
  restoreMapFollowing(previous.following, adapter);
}

function modeEvent(mode: MapMode): MapEvent {
  if (mode === "text") return "showText";
  if (mode === "raster") return "showRaster";
  return "showMap";
}

function restoreMapFollowing(following: boolean, adapter: { current: TrackerMapAdapter | null }): void {
  if (following) {
    adapter.current?.follow();
    return;
  }
  adapter.current?.stopFollowing();
}
