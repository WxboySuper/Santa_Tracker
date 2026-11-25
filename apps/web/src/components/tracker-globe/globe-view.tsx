"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { activeTrackerTheme } from "@/lib/tracker-theme";
import { trackerNow } from "@/lib/tracker-clock";
import { createGlobe, type GlobeHandle } from "./globe-scene";

interface GlobeViewProps {
  /** Timed route nodes (the same list the journey indexes). */
  nodes: RouteNode[];
  position: SantaPosition | null;
  adapter: RefObject<TrackerMapAdapter | null>;
  label: string;
  onStopFollowing: () => void;
  onUnavailable: () => void;
}

function globeAdapter(globe: GlobeHandle): TrackerMapAdapter {
  return {
    mount: () => Promise.resolve(),
    setRoute: () => undefined,
    setSantaPosition: () => undefined,
    follow: () => globe.follow(),
    visitPole: () => globe.visitPole(),
    stopFollowing: () => undefined,
    fitToRoute: () => undefined,
    destroy: () => globe.dispose(),
  };
}

/** The 3D globe layout's map surface. Falls back to the flat map when WebGL is unavailable. */
export function GlobeView({ nodes, position, adapter, label, onStopFollowing, onUnavailable }: GlobeViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const globe = useRef<GlobeHandle | null>(null);
  const stop = useRef(onStopFollowing);
  stop.current = onStopFollowing;

  useEffect(() => {
    if (!canvas.current) return undefined;
    const handle = createGlobe(canvas.current, activeTrackerTheme(), () => stop.current());
    if (!handle) {
      onUnavailable();
      return undefined;
    }
    globe.current = handle;
    adapter.current = globeAdapter(handle);
    return () => {
      handle.dispose();
      globe.current = null;
      adapter.current = null;
    };
  }, [adapter, onUnavailable]);

  useEffect(() => { globe.current?.setRoute(nodes); }, [nodes]);
  useEffect(() => { globe.current?.setPosition(position, trackerNow()); }, [position]);

  return <canvas ref={canvas} className="tt-globe" role="img" aria-label={label} />;
}
