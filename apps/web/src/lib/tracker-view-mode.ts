import { useCallback, useEffect, useState } from "react";

/** View choices for the tracker, including the reserved TV mode. */
export type TrackerViewMode = "standard" | "immersive" | "tv";

/** Parses the supported view mode from the URL. */
export function trackerViewMode(value: string | null): TrackerViewMode {
  return value === "immersive" || value === "tv" ? value : "standard";
}

/** Keeps the selected view in sync with the URL and optional Fullscreen API. */
export function useTrackerViewMode() {
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
    updateModeUrl(next);
    updateFullscreen(next);
  }, [viewMode]);
  return { viewMode, toggleImmersive };
}

/** Replaces the mode query without adding a history entry. */
function updateModeUrl(mode: TrackerViewMode): void {
  const url = new URL(window.location.href);
  if (mode === "immersive") url.searchParams.set("mode", mode);
  else url.searchParams.delete("mode");
  window.history.replaceState({}, "", url);
}

/** Requests or exits fullscreen when the browser supports it. */
function updateFullscreen(mode: TrackerViewMode): void {
  if (mode === "immersive") {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return;
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
