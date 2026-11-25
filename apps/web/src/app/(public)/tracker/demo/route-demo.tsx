"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RouteNode } from "@/lib/locations";
import { demoClockSettings, setDemoClock } from "@/lib/tracker-clock";
import { validRouteNodes } from "@/lib/tracker-route-validation";
import { useTrackerNow } from "@/lib/use-tracker-now";
import TrackerMap from "../tracker-map";
import "./route-demo.css";

const SOURCE = "/api/demo-route";
const SPEEDS = [1, 60, 300, 1200, 3600] as const;
const DEFAULT_SPEED = 300;
const LEAD_IN_MS = 2 * 60_000;

type Stop = { index: number; at: number; node: RouteNode };

function useDraftRoute(): RouteNode[] {
  const [nodes, setNodes] = useState<RouteNode[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(SOURCE, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : { route_nodes: [] }))
      .then((data: { route_nodes: unknown }) => setNodes(validRouteNodes(data.route_nodes)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return nodes;
}

function timeOf(node: RouteNode): number {
  const stamp = node.schedule?.arrival_utc ?? node.schedule?.departure_utc;
  return stamp ? Date.parse(stamp) : Number.NaN;
}

function journeyBounds(nodes: RouteNode[]): { start: number; end: number; stops: Stop[] } | null {
  const takeoff = nodes[0]?.schedule?.departure_utc;
  const last = nodes.at(-1);
  if (!takeoff || !last) return null;
  const stops = nodes
    .map((node, index) => ({ index, at: timeOf(node), node }))
    .filter(stop => stop.node.type === "DELIVERY" && Number.isFinite(stop.at));
  const start = Date.parse(takeoff);
  const end = Math.max(timeOf(last), stops.at(-1)?.at ?? start);
  return { start, end, stops };
}

function currentStopIndex(stops: Stop[], now: number): number {
  let found = -1;
  stops.forEach((stop, i) => { if (stop.at <= now) found = i; });
  return found;
}

function formatUtc(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);
}

function localTimeAt(node: RouteNode, ms: number): string {
  const zone = (node.location as { timezone?: string }).timezone;
  if (zone) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(ms);
    } catch { /* fall back to the offset */ }
  }
  const offset = node.location.timezone_offset ?? 0;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(ms + offset * 3_600_000);
}

function stopTier(node: RouteNode): string | null {
  const tier = (node.stop_experience as { stop_tier?: string } | undefined)?.stop_tier;
  const seconds = node.stop_experience?.duration_seconds;
  if (tier) return `${tier} stop, ${seconds ?? "?"} s`;
  return seconds ? `${seconds} s stop` : null;
}

/** Keeps the demo clock in step with play, pause, speed and seek, and restores the wall clock on exit. */
function useDemoClock(start: number | null) {
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState<number>(DEFAULT_SPEED);
  useEffect(() => {
    if (start === null) return undefined;
    setDemoClock({ atMs: start - LEAD_IN_MS, rate: DEFAULT_SPEED, paused: false });
    return () => setDemoClock(null);
  }, [start]);
  const update = useCallback((patch: Partial<{ atMs: number; rate: number; paused: boolean }>) => {
    const current = demoClockSettings();
    if (!current) return;
    const next = { ...current, ...patch };
    setDemoClock(next);
    setPaused(next.paused);
    setRate(next.rate);
  }, []);
  return { paused, rate, update };
}

function DemoControls({ nodes }: { nodes: RouteNode[] }) {
  const bounds = useMemo(() => journeyBounds(nodes), [nodes]);
  const { paused, rate, update } = useDemoClock(bounds?.start ?? null);
  const now = useTrackerNow().getTime();
  const stops = bounds?.stops ?? [];
  const index = currentStopIndex(stops, now);
  const current = index >= 0 ? stops[index] : null;
  const seekStop = useCallback((target: number) => {
    const stop = stops[Math.max(0, Math.min(stops.length - 1, target))];
    if (stop) update({ atMs: stop.at });
  }, [stops, update]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.key === " ") { event.preventDefault(); update({ paused: !paused }); }
      if (event.key === "ArrowRight") seekStop(index + 1);
      if (event.key === "ArrowLeft") seekStop(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, paused, seekStop, update]);
  if (!bounds) return <div className="route-demo-bar" role="status">Loading the draft route...</div>;
  const span = bounds.end - bounds.start + LEAD_IN_MS;
  const position = Math.min(1, Math.max(0, (now - bounds.start + LEAD_IN_MS) / span));
  return (
    <div className="route-demo-bar" role="region" aria-label="Route demo controls">
      <div className="route-demo-row">
        <button type="button" className="route-demo-play" onClick={() => update({ paused: !paused })} aria-label={paused ? "Play" : "Pause"}>
          {paused ? "▶" : "❚❚"}
        </button>
        <button type="button" className="route-demo-step" onClick={() => seekStop(index - 1)} aria-label="Previous stop">{"‹"}</button>
        <button type="button" className="route-demo-step" onClick={() => seekStop(index + 1)} aria-label="Next stop">{"›"}</button>
        <div className="route-demo-speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map(speed => (
            <button key={speed} type="button" aria-pressed={rate === speed} className="route-demo-speed" onClick={() => update({ rate: speed })}>
              {speed}{"×"}
            </button>
          ))}
        </div>
        <span className="route-demo-clock">{formatUtc(now)} UTC</span>
      </div>
      <input
        type="range"
        className="route-demo-scrub"
        aria-label="Time in the journey"
        min={0}
        max={1000}
        value={Math.round(position * 1000)}
        onChange={event => update({ atMs: bounds.start - LEAD_IN_MS + (Number(event.target.value) / 1000) * span })}
      />
      <div className="route-demo-readout" aria-live="off">
        {current ? (
          <>
            <strong>{current.node.location.name}</strong>
            <span>{current.node.location.region}</span>
            <span>local {localTimeAt(current.node, now)}</span>
            {stopTier(current.node) && <span>{stopTier(current.node)}</span>}
            <span className="route-demo-count">stop {Math.min(index + 1, stops.length)} of {stops.length}</span>
          </>
        ) : (
          <span>On the runway at the North Pole. {stops.length} stops tonight.</span>
        )}
      </div>
    </div>
  );
}

/** The real tracker flying the draft route, with playback controls along the bottom. */
export default function RouteDemo({ locale }: { locale: string }) {
  const nodes = useDraftRoute();
  return (
    <>
      <TrackerMap adventEnabled={false} locale={locale} routeSource={SOURCE} />
      <DemoControls nodes={nodes} />
    </>
  );
}
