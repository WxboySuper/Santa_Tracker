import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioPreferencesFrom, createAudioController } from "@santa-tracker/activity-sdk/audio";
import type { createTranslator } from "@santa-tracker/localization";
import { estimateArrival, type ChosenPlace } from "@/lib/tracker-arrival";
import { CURATED_CITIES, validateStoredPlace } from "@/lib/tracker-place";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";

/** Translator type shared by the immersive overlay controls. */
type Translator = ReturnType<typeof createTranslator>;
/** Inputs needed to render the live immersive presentation. */
type ImmersiveTrackerProps = { locale: string; nodes: RouteNode[]; position: SantaPosition | null; current?: RouteNode; translator: Translator; controlsVisible: boolean };
/** A searchable route stop or curated city. */
type CityOption = ChosenPlace & { lat: number; lng: number };

/** Renders live journey details and the three local ways to choose a place. */
export function ImmersiveTrackerOverlays({ locale, nodes, position, current, translator, controlsVisible }: ImmersiveTrackerProps) {
  const [now, setNow] = useState(() => new Date());
  const [arrivalNotice, setArrivalNotice] = useState<RouteNode | null>(null);
  const [chimes, setChimes] = useState(false);
  const previousStop = useRef<number | null>(null);
  const chimesEnabled = useRef(false);
  const updateChimes = useCallback((enabled: boolean) => { chimesEnabled.current = enabled; setChimes(enabled); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const index = position?.journey.currentIndex ?? null;
    const arrived = stopAfterChange(index, previousStop.current, nodes);
    if (arrived) setArrivalNotice(arrived);
    previousStop.current = index;
  }, [position, nodes]);
  useEffect(() => clearArrivalNotice(arrivalNotice, chimesEnabled.current, setArrivalNotice), [arrivalNotice]);
  const nextIndex = position?.journey.nextIndex ?? null;
  const next = nextIndex === null ? undefined : nodes[nextIndex];
  return <>
    <ImmersiveJourneyHud current={current} next={next} progress={position?.journey.progress ?? 0} now={now} translator={translator} />
    {arrivalNotice && <ArrivalNoticeCard node={arrivalNotice} translator={translator} />}
    <div className={controlsVisible ? "tracker-controls" : "tracker-controls tracker-controls-hidden"}>
      <AudioToggle chimes={chimes} setChimes={updateChimes} translator={translator} />
      <FindMePanel locale={locale} nodes={nodes} now={now} translator={translator} />
    </div>
  </>;
}

/** Returns a stop only after the live route advances from a known stop. */
function stopAfterChange(current: number | null, previous: number | null, nodes: RouteNode[]): RouteNode | null {
  if (current === null) return null;
  if (previous === null) return null;
  if (current === previous) return null;
  return nodes[current] ?? null;
}

/** Plays an opted-in chime and clears the arrival card after a short pause. */
function clearArrivalNotice(node: RouteNode | null, chimes: boolean, clear: (node: RouteNode | null) => void): (() => void) | undefined {
  if (!node) return undefined;
  playArrivalNoticeChime(chimes);
  const timeout = window.setTimeout(() => clear(null), 6500);
  return () => { window.clearTimeout(timeout); };
}

export function playArrivalNoticeChime(chimes: boolean): void {
  if (!chimes) return;
  const audio = createAudioController(audioPreferencesFrom({ enabled: true, reducedSensory: window.matchMedia("(prefers-reduced-motion: reduce)").matches }), { play: playArrivalChime });
  audio.play("arrival");
}

/** Lets the visitor opt in to synthesized stop chimes. */
function AudioToggle({ chimes, setChimes, translator }: { chimes: boolean; setChimes: (value: boolean) => void; translator: Translator }) {
  return <button className="absolute top-32 right-4 z-20 rounded bg-blue-900 px-3 py-2 text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => setChimes(!chimes)} aria-pressed={chimes}>{translator.t(chimes ? "tracker.audioOn" : "tracker.audioOff")}</button>;
}

/** Shows the current stop, next stop, arrival countdown, and route progress. */
function ImmersiveJourneyHud({ current, next, progress, now, translator }: { current?: RouteNode; next?: RouteNode; progress: number; now: Date; translator: Translator }) {
  const percent = Math.round(progress * 100);
  const arrival = next?.schedule?.arrival_utc;
  const arrivalTimestamp = arrival ? Date.parse(arrival) : Number.NaN;
  return <section className="absolute inset-x-0 bottom-0 z-10 bg-slate-950/75 px-5 py-4 text-white backdrop-blur-md" aria-label={translator.t("tracker.progress")}>
    <p className="text-xs uppercase tracking-widest text-white/70">{translator.t("tracker.current")}</p><p className="text-xl font-semibold">{current?.location.name ?? translator.t("tracker.notStarted")}</p>
    <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
      <span>{translator.t("tracker.next")}: {next?.location.name ?? translator.t("tracker.complete")}</span><span>{percent}%</span>
      {Number.isFinite(arrivalTimestamp) && <span>{translator.t("tracker.countdownToArrival", { time: formatTimeRemaining(arrivalTimestamp, now.getTime()) })}</span>}
    </div>
    <div className="mt-2 h-1 rounded bg-white/20"><div className="h-full rounded bg-amber-300" style={{ width: `${percent}%` }} /></div>
  </section>;
}

/** Shows a brief card when Santa reaches a new route stop. */
export function ArrivalNoticeCard({ node, translator, large = false }: { node: RouteNode; translator: Translator; large?: boolean }) {
  return <div className={`tracker-arrival-card absolute left-1/2 top-1/2 z-30 w-[min(90vw,26rem)] rounded-2xl border border-amber-100/30 bg-slate-950/95 p-6 text-center text-white shadow-2xl ${large ? "tracker-arrival-card-tv" : ""}`} role="status">
    <p className="text-2xl font-semibold">{node.location.name}</p><p className="mt-2 text-white/80">{translator.t("tracker.arrivalMoment", { location: node.location.name })}</p>
  </div>;
}

/** Collects a visitor's location choice without sending it to the server. */
function FindMePanel({ locale, nodes, now, translator }: { locale: string; nodes: RouteNode[]; now: Date; translator: Translator }) {
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [search, setSearch] = useState("");
  const [permissionFailed, setPermissionFailed] = useState(false);
  const [persistChoice, setPersistChoice] = useState(true);
  const estimate = useMemo(() => place ? estimateArrival(place, nodes, now) : null, [place, nodes, now]);
  const cityOptions = useMemo(() => searchableCities(nodes, search), [nodes, search]);
  useEffect(() => {
    if (!nodes.length) return;
    try {
      const saved = window.localStorage.getItem("tracker:place");
      if (!saved) return;
      const place = validateStoredPlace(JSON.parse(saved), nodes);
      if (place) setPlace(place);
      else window.localStorage.removeItem("tracker:place");
    } catch { /* Storage can be disabled. */ }
  }, [nodes]);
  useEffect(() => {
    try {
      if (!persistChoice) { window.localStorage.removeItem("tracker:place"); return; }
      if (place) window.localStorage.setItem("tracker:place", JSON.stringify(place));
    }
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
    <ul className="mt-2 max-h-28 overflow-auto">{cityOptions.slice(0, 8).map(option => <li key={`${option.name}-${option.lat}-${option.lng}`}><button className="w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => choosePlace(option, setPlace, setPersistChoice)}>{option.name}</button></li>)}</ul>
    {permissionFailed && <p role="status" className="mt-2 text-sm">{translator.t("tracker.locationPermission")}</p>}
    {estimate && <ArrivalEstimateCard estimate={estimate} now={now} locale={locale} translator={translator} />}
  </section>;
}

/** Builds the searchable list from route stops and a few major cities. */
function searchableCities(nodes: RouteNode[], search: string): CityOption[] {
  const options: CityOption[] = [
    ...nodes.map(node => ({ name: node.location.name, lat: node.location.lat, lng: node.location.lng })),
    ...CURATED_CITIES as CityOption[],
  ];
  return options.filter(option => option.name.toLowerCase().includes(search.toLowerCase()));
}

/** Requests geolocation after a visitor presses the location button. */
function requestLocation(setPlace: (place: ChosenPlace) => void, setPersist: (persist: boolean) => void, fail: (failed: boolean) => void): void {
  if (!navigator.geolocation) { fail(true); return; }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { fail(false); setPersist(false); setPlace({ name: "Your location", lat: coords.latitude, lng: coords.longitude }); },
    () => fail(true),
    { maximumAge: 300000, timeout: 10000 },
  );
}

/** Saves a manual city or time-zone choice on this device. */
function choosePlace(place: ChosenPlace, setPlace: (place: ChosenPlace) => void, setPersist: (persist: boolean) => void): void {
  setPersist(true);
  setPlace(place);
}

/** Shows either an expected arrival time or the local arrival message. */
function ArrivalEstimateCard({ estimate, now, locale, translator }: { estimate: NonNullable<ReturnType<typeof estimateArrival>>; now: Date; locale: string; translator: Translator }) {
  if (now.getTime() < estimate.at.getTime()) {
    return <p className="mt-2 text-sm">{translator.t("tracker.arrivalEstimate", { time: estimate.at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}</p>;
  }
  return <div className="mt-3 rounded-lg border border-amber-200/30 bg-amber-100/10 p-3" role="status"><p className="font-semibold">{translator.t("tracker.hesHereTitle")}</p><p className="text-sm text-white/80">{translator.t("tracker.hereNote")}</p></div>;
}

/** Formats remaining route time as hours, minutes, and seconds. */
function formatTimeRemaining(arrival: number, now: number): string {
  const seconds = Math.max(0, Math.floor((arrival - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, "0")).join(":");
}

/** Plays two quiet sine tones through Web Audio and closes the context. */
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
    oscillator.onended = () => { context.close().catch(() => undefined); };
  } catch { /* Audio is optional, so an unavailable device stays quiet. */ }
}
