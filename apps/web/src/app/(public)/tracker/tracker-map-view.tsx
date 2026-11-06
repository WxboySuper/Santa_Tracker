import Link from "next/link";
import type { Dispatch, RefObject } from "react";
import Countdown from "@/components/countdown";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import type { SantaPosition } from "@/lib/tracker-position";
import type { MapEvent, MapMode } from "./tracker-map-hooks";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import type { TrackerViewMode } from "@/lib/tracker-view-mode";
import { estimateArrival, type ChosenPlace } from "@/lib/tracker-arrival";
import { audioPreferencesFrom, createAudioController } from "@santa-tracker/activity-sdk/audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function TrackerMapView({ adventEnabled, locale, translator, element, adapter, mode, dispatch, nodes, position, current, status, following, setFollowing, viewMode, setViewMode, toggleImmersive }: { adventEnabled: boolean; locale: string; translator: Translator; element: RefObject<HTMLDivElement | null>; adapter: RefObject<TrackerMapAdapter | null>; mode: MapMode; dispatch: Dispatch<MapEvent>; nodes: RouteNode[]; position: SantaPosition | null; current?: RouteNode; status: string; following: boolean; setFollowing: (value: boolean) => void; viewMode: TrackerViewMode; setViewMode: (mode: TrackerViewMode) => void; toggleImmersive: () => void }) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [chimes, setChimes] = useState(false);
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [search, setSearch] = useState("");
  const [arrivalNotice, setArrivalNotice] = useState<RouteNode | null>(null);
  const [permissionFailed, setPermissionFailed] = useState(false);
  const [activity, setActivity] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const previousStop = useRef<number | null>(null);
  const estimate = useMemo(() => place ? estimateArrival(place, nodes, now) : null, [place, nodes, now]);
  const wakeControls = useCallback(() => { setControlsVisible(true); setActivity(value => value + 1); }, []);
  useEffect(() => {
    if (viewMode !== "immersive") return;
    const timer = window.setTimeout(() => setControlsVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [activity, controlsVisible, viewMode]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const index = position?.journey.currentIndex ?? null;
    if (index != null && previousStop.current != null && index !== previousStop.current) {
      const stop = nodes[index];
      if (stop) setArrivalNotice(stop);
    }
    previousStop.current = index;
  }, [position, nodes]);
  useEffect(() => {
    if (!arrivalNotice) return;
    const audio = createAudioController(audioPreferencesFrom({
      enabled: chimes,
      reducedSensory: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    }), { play: () => playArrivalChime() });
    audio.play("arrival");
    const timeout = window.setTimeout(() => setArrivalNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [arrivalNotice, chimes]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("tracker:place");
      if (saved) setPlace(JSON.parse(saved) as ChosenPlace);
    } catch { /* Storage can be disabled. */ }
  }, []);
  useEffect(() => {
    if (!place) return;
    try { window.localStorage.setItem("tracker:place", JSON.stringify(place)); }
    catch { /* The selection remains available for this visit. */ }
  }, [place]);
  const askLocation = useCallback(() => {
    if (!navigator.geolocation) { setPermissionFailed(true); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setPlace({ name: translator.t("tracker.locationSaved"), lat: coords.latitude, lng: coords.longitude }),
      () => setPermissionFailed(true),
      { maximumAge: 300000, timeout: 10000 },
    );
  }, [translator]);
  const cityOptions = useMemo(() => [
    ...nodes.map(node => ({ name: node.location.name, lat: node.location.lat, lng: node.location.lng, timezone: undefined as string | undefined })),
    { name: "New York", lat: 40.7128, lng: -74.006, timezone: "America/New_York" },
    { name: "London", lat: 51.5072, lng: -0.1276, timezone: "Europe/London" },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, timezone: "Asia/Tokyo" },
    { name: "Sydney", lat: -33.8688, lng: 151.2093, timezone: "Australia/Sydney" },
  ].filter(option => option.name.toLowerCase().includes(search.toLowerCase())), [nodes, search]);
  const immersive = viewMode === "immersive";
  return <>
    {!immersive && <TrackerNav adventEnabled={adventEnabled} translator={translator} />}
    <div className={`tracker-stage relative w-screen h-screen ${immersive ? "tracker-immersive" : ""}`} onPointerMove={wakeControls} onKeyDown={event => { wakeControls(); if (event.key === "Escape" && immersive) toggleImmersive(); }}>
      {mode !== "text" && <div ref={element} className="w-full h-full bg-blue-950 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" aria-label={translator.t("tracker.mapLabel")} aria-describedby="map-instructions" role="application" tabIndex={0} />}
      {mode === "text" && <JourneyPanel nodes={nodes} position={position} translator={translator} locale={locale} />}
      <div className={immersive && !controlsVisible ? "tracker-controls tracker-controls-hidden" : "tracker-controls"}>
        <MapControls mode={mode} following={following} dispatch={dispatch} translator={translator} adapter={adapter} setFollowing={setFollowing} />
        <button className="absolute top-20 right-4 z-20 rounded bg-blue-900 px-3 py-2 text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={toggleImmersive}>{translator.t(immersive ? "tracker.exitImmersive" : "tracker.immersive")}</button>
        {immersive && <button className="absolute top-32 right-4 z-20 rounded bg-blue-900 px-3 py-2 text-white" onClick={() => setChimes(value => !value)} aria-pressed={chimes}>{translator.t(chimes ? "tracker.audioOn" : "tracker.audioOff")}</button>}
      </div>
      {mode !== "text" && <p id="map-instructions" className="absolute left-4 bottom-16 z-10 max-w-[calc(100%-2rem)] rounded bg-black/70 px-3 py-2 text-sm text-white">{translator.t("tracker.instructions")}</p>}
      <p className="absolute left-4 bottom-4 z-10 rounded bg-black/70 px-3 py-2 text-sm text-white">{status}</p>
      <p className="sr-only" aria-live="polite">{current ? translator.t("tracker.announcement", { location: current.location.name }) : ""}</p>
      <div className="countdown-hud absolute top-20 right-4 bg-black/40 backdrop-blur-md rounded-xl p-4 text-white">
        <p className="countdown-hud-label text-xs opacity-70">{translator.t("home.countdown")}</p>
        <Countdown locale={locale} className="countdown-hud-value font-mono text-lg" flyingText={translator.t("countdown.flying")} />
      </div>
      {immersive && <section className="absolute inset-x-0 bottom-0 z-10 bg-slate-950/75 px-5 py-4 text-white backdrop-blur-md" aria-label={translator.t("tracker.progress")}>
        <p className="text-xs uppercase tracking-widest text-white/70">{translator.t("tracker.current")}</p><p className="text-xl font-semibold">{current?.location.name ?? translator.t("tracker.notStarted")}</p>
        <div className="mt-2 flex justify-between text-sm"><span>{translator.t("tracker.next")}: {position?.journey.nextIndex == null ? translator.t("tracker.complete") : nodes[position.journey.nextIndex]?.location.name}</span><span>{Math.round((position?.journey.progress ?? 0) * 100)}%</span></div>
        <div className="mt-2 h-1 rounded bg-white/20"><div className="h-full rounded bg-amber-300" style={{ width: `${Math.round((position?.journey.progress ?? 0) * 100)}%` }} /></div>
      </section>}
      {arrivalNotice && <div className="tracker-arrival-card absolute left-1/2 top-1/2 z-30 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-100/30 bg-slate-950/90 p-6 text-center text-white shadow-2xl" role="status"><p className="text-2xl font-semibold">{arrivalNotice.location.name}</p><p className="mt-2 text-white/80">{translator.t("tracker.arrivalMoment", { location: arrivalNotice.location.name })}</p></div>}
      <section className="absolute bottom-20 left-4 z-20 max-w-sm rounded-xl bg-slate-950/85 p-4 text-white" aria-label={translator.t("tracker.findMe")}>
        <h2 className="font-semibold">{translator.t("tracker.findMe")}</h2>
        <div className="mt-2 flex flex-wrap gap-2"><button className="rounded bg-blue-800 px-3 py-2" onClick={askLocation}>{translator.t("tracker.useLocation")}</button><button className="rounded bg-blue-800 px-3 py-2" onClick={() => { const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; setPlace({ name: timezone, timezone }); }}>{translator.t("tracker.useTimezone")}</button></div>
        <label className="mt-3 block text-sm" htmlFor="tracker-city">{translator.t("tracker.chooseCity")}</label><input id="tracker-city" value={search} onChange={event => setSearch(event.target.value)} placeholder={translator.t("tracker.citySearch")} className="mt-1 w-full rounded bg-white px-3 py-2 text-slate-950" />
        <ul className="mt-2 max-h-28 overflow-auto">{cityOptions.slice(0, 8).map(option => <li key={option.name}><button className="w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => setPlace(option)}>{option.name}</button></li>)}</ul>
        {permissionFailed && <p role="status" className="mt-2 text-sm">{translator.t("tracker.locationPermission")}</p>}
        {estimate && <p className="mt-2 text-sm">{now.getTime() >= estimate.at.getTime() ? translator.t("tracker.hesHereTitle") : translator.t("tracker.arrivalEstimate", { time: estimate.at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}</p>}
      </section>
    </div>
  </>;
}

function playArrivalChime(): void {
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(659.25, context.currentTime);
    oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Audio is optional, so an unavailable device stays quiet. */ }
}
