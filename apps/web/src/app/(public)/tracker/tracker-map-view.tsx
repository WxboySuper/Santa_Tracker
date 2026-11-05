import Link from "next/link";
import type { Dispatch, RefObject } from "react";
import Countdown from "@/components/countdown";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import type { SantaPosition } from "@/lib/tracker-position";
import type { MapEvent, MapMode } from "./tracker-map-hooks";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";

type Translator = ReturnType<typeof createTranslator>;

export function JourneyPanel({ nodes, position, translator, locale }: { nodes: RouteNode[]; position: SantaPosition | null; translator: Translator; locale: string }) {
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

function TrackerNav({ adventEnabled, translator }: { adventEnabled: boolean; translator: Translator }) {
  return <nav className="glass-nav fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-white/20 backdrop-blur-md rounded-full px-6 py-2 flex gap-4">
    <Link href="/" className="nav-link text-white/80 hover:text-white">{translator.t("nav.home")}</Link>
    <Link href="/tracker" className="nav-link nav-link-active text-white font-semibold">{translator.t("nav.tracker")}</Link>
    {adventEnabled && <Link href="/advent" className="nav-link text-white/80 hover:text-white">{translator.t("nav.village")}</Link>}
  </nav>;
}

function MapControls({ mode, following, dispatch, translator, adapter, setFollowing }: { mode: MapMode; following: boolean; dispatch: Dispatch<MapEvent>; translator: Translator; adapter: RefObject<TrackerMapAdapter | null>; setFollowing: (value: boolean) => void }) {
  return <div className="absolute top-20 left-4 z-10 flex flex-col items-start gap-2 text-white">
    <button className="rounded bg-blue-900 px-3 py-2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => { dispatch(mode === "text" ? "showMap" : "showText"); setFollowing(true); }}>{translator.t(mode === "text" ? "tracker.mapMode" : "tracker.textMode")}</button>
    {mode !== "text" && !following && <button className="rounded bg-blue-900 px-3 py-2 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => { adapter.current?.follow(); setFollowing(true); }}>{translator.t("tracker.return")}</button>}
  </div>;
}

export function TrackerMapView({ adventEnabled, locale, translator, element, adapter, mode, dispatch, nodes, position, current, status, following, setFollowing }: { adventEnabled: boolean; locale: string; translator: Translator; element: RefObject<HTMLDivElement | null>; adapter: RefObject<TrackerMapAdapter | null>; mode: MapMode; dispatch: Dispatch<MapEvent>; nodes: RouteNode[]; position: SantaPosition | null; current?: RouteNode; status: string; following: boolean; setFollowing: (value: boolean) => void }) {
  return <>
    <TrackerNav adventEnabled={adventEnabled} translator={translator} />
    <div className="relative w-screen h-screen">
      {mode !== "text" && <div ref={element} className="w-full h-full bg-blue-950 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" aria-label={translator.t("tracker.mapLabel")} aria-describedby="map-instructions" role="application" tabIndex={0} />}
      {mode === "text" && <JourneyPanel nodes={nodes} position={position} translator={translator} locale={locale} />}
      <MapControls mode={mode} following={following} dispatch={dispatch} translator={translator} adapter={adapter} setFollowing={setFollowing} />
      {mode !== "text" && <p id="map-instructions" className="absolute left-4 bottom-16 z-10 max-w-[calc(100%-2rem)] rounded bg-black/70 px-3 py-2 text-sm text-white">{translator.t("tracker.instructions")}</p>}
      <p className="absolute left-4 bottom-4 z-10 rounded bg-black/70 px-3 py-2 text-sm text-white">{status}</p>
      <p className="sr-only" aria-live="polite">{current ? translator.t("tracker.announcement", { location: current.location.name }) : ""}</p>
      <div className="countdown-hud absolute top-20 right-4 bg-black/40 backdrop-blur-md rounded-xl p-4 text-white">
        <p className="countdown-hud-label text-xs opacity-70">{translator.t("home.countdown")}</p>
        <Countdown locale={locale} className="countdown-hud-value font-mono text-lg" flyingText={translator.t("countdown.flying")} />
      </div>
    </div>
  </>;
}
