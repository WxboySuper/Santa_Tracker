"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import "ol/ol.css";
import { createTranslator } from "@santa-tracker/localization";
import Countdown from "@/components/countdown";
import type { RouteNode } from "@/lib/locations";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import { computeSantaPosition, type SantaPosition } from "@/lib/tracker-position";
import { mapModeReducer, type TrackerMapAdapter } from "@/lib/tracker-map-adapter";

interface TrackerMapProps { adventEnabled: boolean; locale: string }
type Translator = ReturnType<typeof createTranslator>;

function JourneyPanel({ nodes, position, translator, locale }: { nodes: RouteNode[]; position: SantaPosition | null; translator: Translator; locale: string }) {
  const timedNodes = routeNodesToContractRoute(nodes).timedNodes;
  const currentIndex = position?.journey.currentIndex ?? null;
  const nextIndex = position?.journey.nextIndex ?? null;
  const current = currentIndex == null ? undefined : timedNodes[currentIndex];
  const next = nextIndex == null ? undefined : timedNodes[nextIndex];
  const arrival = next?.schedule?.arrival_utc;
  const recent = currentIndex == null ? [] : timedNodes.slice(Math.max(0, currentIndex - 4), currentIndex + 1).reverse();
  return (
    <section className="absolute inset-0 overflow-auto bg-blue-950 px-6 pt-36 pb-8 text-white" aria-label={translator.t("tracker.textMode")}>
      <dl className="mx-auto max-w-xl space-y-4">
        <div><dt>{translator.t("tracker.current")}</dt><dd className="text-2xl font-bold">{current?.location.name ?? translator.t("tracker.notStarted")}</dd></div>
        <div><dt>{translator.t("tracker.next")}</dt><dd>{next?.location.name ?? translator.t("tracker.complete")}</dd></div>
        <div><dt>{translator.t("tracker.arrival")}</dt><dd>{arrival ? new Date(arrival).toLocaleString(locale) : translator.t("tracker.unknown")}</dd></div>
        <div><dt>{translator.t("tracker.progress")}</dt><dd>{Math.round((position?.journey.progress ?? 0) * 100)}%</dd></div>
      </dl>
      <div className="mx-auto mt-6 max-w-xl"><h2 className="font-bold">{translator.t("tracker.recent")}</h2><ul>{recent.map(node => <li key={node.id}>{node.location.name}</li>)}</ul></div>
    </section>
  );
}

export default function TrackerMap({ adventEnabled, locale }: TrackerMapProps) {
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const element = useRef<HTMLDivElement>(null);
  const adapter = useRef<TrackerMapAdapter | null>(null);
  const [mode, dispatch] = useReducer(mapModeReducer, "vector");
  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [position, setPosition] = useState<SantaPosition | null>(null);
  const [status, setStatus] = useState(translator.t("tracker.loading"));
  const [following, setFollowing] = useState(true);
  const latestNodes = useRef(nodes);
  const latestPosition = useRef(position);
  latestNodes.current = nodes;
  latestPosition.current = position;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/route", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Route request failed");
      const data: { route_nodes: RouteNode[] } = await response.json();
      if (!Array.isArray(data.route_nodes)) throw new Error("Invalid route");
      setNodes(data.route_nodes);
      setStatus(translator.t("tracker.loaded", { count: data.route_nodes.length }));
    }).catch(() => { if (!controller.signal.aborted) setStatus(translator.t("tracker.unavailable")); });
    return () => controller.abort();
  }, [translator]);

  useEffect(() => {
    const tick = () => setPosition(computeSantaPosition(nodes, new Date()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nodes]);

  useEffect(() => {
    if (mode === "text") return;
    let cancelled = false;
    let instance: TrackerMapAdapter | undefined;
    const start = async () => {
      let isStyleFailure = false;
      try {
        const { OpenLayersTrackerMap, StyleLoadError } = await import("@/lib/openlayers-tracker-map");
        if (cancelled || !element.current) return;
        instance = new OpenLayersTrackerMap(mode, () => dispatch("rasterFailed"), () => setFollowing(false));
        adapter.current = instance;
        instance.setRoute(latestNodes.current);
        if (latestPosition.current) instance.setSantaPosition(latestPosition.current);
        try { await instance.mount(element.current); }
        catch (error) { isStyleFailure = error instanceof StyleLoadError; throw error; }
      } catch {
        if (!cancelled) dispatch(isStyleFailure ? "vectorFailed" : "initFailed");
      }
    };
    void start();
    return () => { cancelled = true; instance?.destroy(); adapter.current = null; };
  }, [mode]);

  useEffect(() => { adapter.current?.setRoute(nodes); }, [nodes]);
  useEffect(() => { if (position) adapter.current?.setSantaPosition(position); }, [position]);

  const timedNodes = routeNodesToContractRoute(nodes).timedNodes;
  const current = position?.journey.currentIndex == null ? undefined : timedNodes[position.journey.currentIndex];
  return (
    <>
      <nav className="glass-nav fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-white/20 backdrop-blur-md rounded-full px-6 py-2 flex gap-4">
        <Link href="/" className="nav-link text-white/80 hover:text-white">{translator.t("nav.home")}</Link>
        <Link href="/tracker" className="nav-link nav-link-active text-white font-semibold">{translator.t("nav.tracker")}</Link>
        {adventEnabled && <Link href="/advent" className="nav-link text-white/80 hover:text-white">{translator.t("nav.village")}</Link>}
      </nav>
      <div className="relative w-screen h-screen">
        {mode !== "text" && <div ref={element} className="w-full h-full bg-blue-950 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" aria-label={translator.t("tracker.mapLabel")} aria-describedby="map-instructions" role="application" tabIndex={0} />}
        {mode === "text" && <JourneyPanel nodes={nodes} position={position} translator={translator} locale={locale} />}
        <div className="absolute top-20 left-4 z-10 flex flex-col items-start gap-2 text-white">
          <button className="rounded bg-blue-900 px-3 py-2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => { dispatch(mode === "text" ? "showMap" : "showText"); setFollowing(true); }}>{translator.t(mode === "text" ? "tracker.mapMode" : "tracker.textMode")}</button>
          {mode !== "text" && !following && <button className="rounded bg-blue-900 px-3 py-2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => { adapter.current?.follow(); setFollowing(true); }}>{translator.t("tracker.return")}</button>}
        </div>
        {mode !== "text" && <p id="map-instructions" className="absolute left-4 bottom-16 z-10 max-w-[calc(100%-2rem)] rounded bg-black/70 px-3 py-2 text-sm text-white">{translator.t("tracker.instructions")}</p>}
        <p className="absolute left-4 bottom-4 z-10 rounded bg-black/70 px-3 py-2 text-sm text-white">{status}</p>
        <p className="sr-only" aria-live="polite">{current ? translator.t("tracker.announcement", { location: current.location.name }) : ""}</p>
        <div className="countdown-hud absolute top-20 right-4 bg-black/40 backdrop-blur-md rounded-xl p-4 text-white">
          <p className="countdown-hud-label text-xs opacity-70">{translator.t("home.countdown")}</p>
          <Countdown locale={locale} className="countdown-hud-value font-mono text-lg" flyingText={translator.t("countdown.flying")} />
        </div>
      </div>
    </>
  );
}
