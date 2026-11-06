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
    const sync = () => {
      const mode = new URLSearchParams(window.location.search).get("mode");
      setViewMode(trackerViewMode(mode));
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const syncFullscreen = () => {
      if (document.fullscreenElement) return;
      if (viewMode !== "immersive") return;
      setViewMode("standard");
      updateModeUrl("standard");
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, [viewMode]);
  const toggleImmersive = useCallback(() => {
    const next = viewMode === "immersive" ? "standard" : "immersive";
    setViewMode(next);
    updateModeUrl(next);
    updateFullscreen(next);
  }, [viewMode]);
  const toggleTv = useCallback(() => {
    const next = viewMode === "tv" ? "standard" : "tv";
    setViewMode(next);
    updateModeUrl(next);
  }, [viewMode]);
  return { viewMode, toggleImmersive, toggleTv };
}

/** Replaces the mode query without adding a history entry. */
function updateModeUrl(mode: TrackerViewMode): void {
  const url = new URL(window.location.href);
  if (mode !== "standard") url.searchParams.set("mode", mode);
  else url.searchParams.delete("mode");
  window.history.replaceState({}, "", url);
}

/** Requests or exits fullscreen when the browser supports it. */
function updateFullscreen(mode: TrackerViewMode): void {
  if (mode === "immersive") {
    catchFullscreenError(document.documentElement.requestFullscreen?.() as unknown);
    return;
  }
  if (document.fullscreenElement) catchFullscreenError(document.exitFullscreen() as unknown);
}

function catchFullscreenError(result: unknown): void {
  if (typeof result !== "object" || result === null) return;
  if (!("catch" in result) || typeof result.catch !== "function") return;
  result.catch(() => undefined);
}
