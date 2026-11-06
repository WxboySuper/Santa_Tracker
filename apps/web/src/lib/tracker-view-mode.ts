import { useCallback, useEffect, useState } from "react";

export type TrackerViewMode = "standard" | "immersive" | "tv";

export function trackerViewMode(value: string | null): TrackerViewMode {
  return value === "immersive" || value === "tv" ? value : "standard";
}

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

function updateModeUrl(mode: TrackerViewMode): void {
  const url = new URL(window.location.href);
  if (mode === "immersive") url.searchParams.set("mode", mode);
  else url.searchParams.delete("mode");
  window.history.replaceState({}, "", url);
}

function updateFullscreen(mode: TrackerViewMode): void {
  if (mode === "immersive") void document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}
