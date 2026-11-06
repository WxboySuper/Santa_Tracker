import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioPreferencesFrom, createAudioController } from "@santa-tracker/activity-sdk/audio";
import type { createTranslator } from "@santa-tracker/localization";
import { estimateArrival, type ChosenPlace } from "@/lib/tracker-arrival";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";

type Translator = ReturnType<typeof createTranslator>;
type ImmersiveTrackerProps = { locale: string; nodes: RouteNode[]; position: SantaPosition | null; current?: RouteNode; translator: Translator };
type CityOption = ChosenPlace & { lat: number; lng: number };

export function ImmersiveTrackerOverlays({ locale, nodes, position, current, translator }: ImmersiveTrackerProps) {
  const [now, setNow] = useState(() => new Date());
  const [arrivalNotice, setArrivalNotice] = useState<RouteNode | null>(null);
  const [chimes, setChimes] = useState(false);
  const previousStop = useRef<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const index = position?.journey.currentIndex ?? null;
    const prior = previousStop.current;
    if (index != null && prior != null && index !== prior) setArrivalNotice(nodes[index] ?? null);
    previousStop.current = index;
  }, [position, nodes]);
  useEffect(() => showArrivalNotice(arrivalNotice, chimes, setArrivalNotice), [arrivalNotice, chimes]);
  const next = position?.journey.nextIndex == null ? undefined : nodes[position.journey.nextIndex];
  return <>
    <AudioToggle chimes={chimes} setChimes={setChimes} translator={translator} />
    <ImmersiveJourneyHud current={current} next={next} progress={position?.journey.progress ?? 0} now={now} translator={translator} />
    {arrivalNotice && <ArrivalNoticeCard node={arrivalNotice} translator={translator} />}
    <FindMePanel locale={locale} nodes={nodes} now={now} translator={translator} />
  </>;
}

function showArrivalNotice(node: RouteNode | null, chimes: boolean, clear: (node: RouteNode | null) => void): (() => void) | undefined {
  if (!node) return undefined;
  const audio = createAudioController(audioPreferencesFrom({ enabled: chimes, reducedSensory: window.matchMedia("(prefers-reduced-motion: reduce)").matches }), { play: playArrivalChime });
  audio.play("arrival");
  const timeout = window.setTimeout(() => clear(null), 6500);
  return () => window.clearTimeout(timeout);
}

function AudioToggle({ chimes, setChimes, translator }: { chimes: boolean; setChimes: (value: boolean) => void; translator: Translator }) {
  return <button className="absolute top-32 right-4 z-20 rounded bg-blue-900 px-3 py-2 text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => setChimes(!chimes)} aria-pressed={chimes}>{translator.t(chimes ? "tracker.audioOn" : "tracker.audioOff")}</button>;
}

function ImmersiveJourneyHud({ current, next, progress, now, translator }: { current?: RouteNode; next?: RouteNode; progress: number; now: Date; translator: Translator }) {
  const percent = Math.round(progress * 100);
  const arrival = next?.schedule?.arrival_utc;
  return <section className="absolute inset-x-0 bottom-0 z-10 bg-slate-950/75 px-5 py-4 text-white backdrop-blur-md" aria-label={translator.t("tracker.progress")}>
    <p className="text-xs uppercase tracking-widest text-white/70">{translator.t("tracker.current")}</p><p className="text-xl font-semibold">{current?.location.name ?? translator.t("tracker.notStarted")}</p>
    <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
      <span>{translator.t("tracker.next")}: {next?.location.name ?? translator.t("tracker.complete")}</span><span>{percent}%</span>
      {arrival && <span>{translator.t("tracker.countdownToArrival", { time: formatTimeRemaining(Date.parse(arrival), now.getTime()) })}</span>}
    </div>
    <div className="mt-2 h-1 rounded bg-white/20"><div className="h-full rounded bg-amber-300" style={{ width: `${percent}%` }} /></div>
  </section>;
}

function ArrivalNoticeCard({ node, translator }: { node: RouteNode; translator: Translator }) {
  return <div className="tracker-arrival-card absolute left-1/2 top-1/2 z-30 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-100/30 bg-slate-950/90 p-6 text-center text-white shadow-2xl" role="status">
    <p className="text-2xl font-semibold">{node.location.name}</p><p className="mt-2 text-white/80">{translator.t("tracker.arrivalMoment", { location: node.location.name })}</p>
  </div>;
}

function FindMePanel({ locale, nodes, now, translator }: { locale: string; nodes: RouteNode[]; now: Date; translator: Translator }) {
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [search, setSearch] = useState("");
  const [permissionFailed, setPermissionFailed] = useState(false);
  const [persistChoice, setPersistChoice] = useState(true);
  const estimate = useMemo(() => place ? estimateArrival(place, nodes, now) : null, [place, nodes, now]);
  const cityOptions = useMemo(() => searchableCities(nodes, search), [nodes, search]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("tracker:place");
      if (saved) setPlace(JSON.parse(saved) as ChosenPlace);
    } catch { /* Storage can be disabled. */ }
  }, []);
  useEffect(() => {
    if (!place || !persistChoice) return;
    try { window.localStorage.setItem("tracker:place", JSON.stringify(place)); }
    catch { /* The selection remains available for this visit. */ }
  }, [place, persistChoice]);
  const askLocation = useCallback(() => requestLocation(setPlace, setPersistChoice, setPermissionFailed), []);
  const chooseTimezone = useCallback(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setPersistChoice(true);
    setPlace({ name: timezone, timezone });
  }, []);
  return <section className="absolute bottom-20 left-4 z-20 max-w-sm rounded-xl bg-slate-950/85 p-4 text-white" aria-label={translator.t("tracker.findMe")}>
    <h2 className="font-semibold">{translator.t("tracker.findMe")}</h2>
    <div className="mt-2 flex flex-wrap gap-2">
      <button className="rounded bg-blue-800 px-3 py-2" onClick={askLocation}>{translator.t("tracker.useLocation")}</button>
      <button className="rounded bg-blue-800 px-3 py-2" onClick={chooseTimezone}>{translator.t("tracker.useTimezone")}</button>
    </div>
    <label className="mt-3 block text-sm" htmlFor="tracker-city">{translator.t("tracker.chooseCity")}</label>
    <input id="tracker-city" value={search} onChange={event => setSearch(event.target.value)} placeholder={translator.t("tracker.citySearch")} className="mt-1 w-full rounded bg-white px-3 py-2 text-slate-950" />
    <ul className="mt-2 max-h-28 overflow-auto">{cityOptions.slice(0, 8).map(option => <li key={option.name}><button className="w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => choosePlace(option, setPlace, setPersistChoice)}>{option.name}</button></li>)}</ul>
    {permissionFailed && <p role="status" className="mt-2 text-sm">{translator.t("tracker.locationPermission")}</p>}
    {estimate && <ArrivalEstimateCard estimate={estimate} now={now} locale={locale} translator={translator} />}
  </section>;
}

function searchableCities(nodes: RouteNode[], search: string): CityOption[] {
  const options: CityOption[] = [
    ...nodes.map(node => ({ name: node.location.name, lat: node.location.lat, lng: node.location.lng })),
    { name: "New York", lat: 40.7128, lng: -74.006, timezone: "America/New_York" },
    { name: "London", lat: 51.5072, lng: -0.1276, timezone: "Europe/London" },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, timezone: "Asia/Tokyo" },
    { name: "Sydney", lat: -33.8688, lng: 151.2093, timezone: "Australia/Sydney" },
  ];
  return options.filter(option => option.name.toLowerCase().includes(search.toLowerCase()));
}

function requestLocation(setPlace: (place: ChosenPlace) => void, setPersist: (persist: boolean) => void, fail: (failed: boolean) => void): void {
  if (!navigator.geolocation) { fail(true); return; }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { setPersist(false); setPlace({ name: "Your location", lat: coords.latitude, lng: coords.longitude }); },
    () => fail(true),
    { maximumAge: 300000, timeout: 10000 },
  );
}

function choosePlace(place: ChosenPlace, setPlace: (place: ChosenPlace) => void, setPersist: (persist: boolean) => void): void {
  setPersist(true);
  setPlace(place);
}

function ArrivalEstimateCard({ estimate, now, locale, translator }: { estimate: NonNullable<ReturnType<typeof estimateArrival>>; now: Date; locale: string; translator: Translator }) {
  if (now.getTime() < estimate.at.getTime()) {
    return <p className="mt-2 text-sm">{translator.t("tracker.arrivalEstimate", { time: estimate.at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}</p>;
  }
  return <div className="mt-3 rounded-lg border border-amber-200/30 bg-amber-100/10 p-3" role="status"><p className="font-semibold">{translator.t("tracker.hesHereTitle")}</p><p className="text-sm text-white/80">{translator.t("tracker.hereNote")}</p></div>;
}

function formatTimeRemaining(arrival: number, now: number): string {
  const seconds = Math.max(0, Math.floor((arrival - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, "0")).join(":");
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
