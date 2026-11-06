import { useEffect, useMemo, useRef, useState } from "react";
import type { createTranslator } from "@santa-tracker/localization";
import type { ChosenPlace } from "@/lib/tracker-arrival";
import { validateStoredPlace } from "@/lib/tracker-place";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import { deriveTvDashboard } from "@/lib/tracker-tv";
import { ArrivalNoticeCard, playArrivalNoticeChime } from "./tracker-map-immersive";

type Translator = ReturnType<typeof createTranslator>;
type WakeLockSentinel = { release: () => Promise<void>; released: boolean };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
type ArrivalDisplayInput = { place: ChosenPlace; arrival: Date | null; now: Date; locale: string; translator: Translator };

/** Renders the read-only route dashboard and keeps the display awake when supported. */
export function TvTrackerDashboard({ locale, nodes, position, translator }: { locale: string; nodes: RouteNode[]; position: SantaPosition | null; translator: Translator }) {
  const [now, setNow] = useState(() => new Date());
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [chimes, setChimes] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState<RouteNode | null>(null);
  const previousStop = useRef<number | null>(null);
  const chimesEnabled = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const dashboard = useMemo(() => deriveTvDashboard({
    nodes,
    currentIndex: position?.journey.currentIndex ?? null,
    progress: position?.journey.progress ?? 0,
    place,
    now,
    locale,
  }), [locale, nodes, now, place, position]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => readSavedPlace(nodes, setPlace), [nodes]);
  useEffect(() => showArrivalOnStopChange(position?.journey.currentIndex ?? null, previousStop, nodes, setArrivalNotice), [nodes, position]);
  useEffect(() => { chimesEnabled.current = chimes; }, [chimes]);
  useEffect(() => clearArrivalCard(arrivalNotice, chimesEnabled.current, setArrivalNotice), [arrivalNotice]);
  useEffect(() => keepScreenAwake(wakeLock), []);

  return <section className="tracker-tv-panel" aria-label={translator.t("tracker.tvPanel")}>
    <TvDashboardHeader current={dashboard.current?.location.name} localTime={dashboard.santaLocalTime} translator={translator} />
    <TvProgress progress={dashboard.progressPercent} translator={translator} />
    <TvNextStops stops={dashboard.nextStops} translator={translator} />
    <TvVisitorEstimate place={place} arrival={dashboard.visitorArrival} now={now} locale={locale} translator={translator} />
    <TvAudioToggle chimes={chimes} toggle={() => setChimes(value => !value)} translator={translator} />
    <TvArrivalNotice node={arrivalNotice} translator={translator} />
  </section>;
}

function TvDashboardHeader({ current, localTime, translator }: { current?: string; localTime: string; translator: Translator }) {
  const name = current ?? translator.t("tracker.notStarted");
  return <div className="tracker-tv-topline">
    <div>
      <p className="tracker-tv-eyebrow">{translator.t("tracker.current")}</p>
      <h1 className="tracker-tv-current">{name}</h1>
    </div>
    <div className="tracker-tv-clock" aria-live="off">
      <p className="tracker-tv-eyebrow">{translator.t("tracker.localTime")}</p>
      <p className="tracker-tv-clock-time">{localTime}</p>
    </div>
  </div>;
}

function TvProgress({ progress, translator }: { progress: number; translator: Translator }) {
  return <div className="tracker-tv-progress" aria-label={`${translator.t("tracker.progress")}: ${progress}%`}>
    <div className="tracker-tv-progress-label"><span>{translator.t("tracker.progress")}</span><span>{progress}%</span></div>
    <div className="tracker-tv-progress-track" aria-hidden="true"><div className="tracker-tv-progress-value" style={{ width: `${progress}%` }} /></div>
  </div>;
}

function TvNextStops({ stops, translator }: { stops: ReturnType<typeof deriveTvDashboard>["nextStops"]; translator: Translator }) {
  if (!stops.length) return <section className="tracker-tv-stops"><h2>{translator.t("tracker.next")}</h2><p className="tracker-tv-muted">{translator.t("tracker.complete")}</p></section>;
  return <section className="tracker-tv-stops">
    <h2>{translator.t("tracker.next")}</h2>
    <ol>{stops.map((stop, index) => <li key={stop.id}>
      <span className="tracker-tv-stop-index">{index + 1}</span>
      <span className="tracker-tv-stop-name">{stop.name}</span>
      <time className="tracker-tv-stop-time" dateTime={stop.arrival?.toISOString()}>{stop.localArrival}</time>
    </li>)}</ol>
  </section>;
}

function TvVisitorEstimate({ place, arrival, now, locale, translator }: Omit<ArrivalDisplayInput, "place"> & { place: ChosenPlace | null }) {
  if (!place) return <section className="tracker-tv-visitor" aria-live="polite"><h2>{translator.t("tracker.findMe")}</h2><p className="tracker-tv-muted">{translator.t("tracker.tvFindMeHint")}</p></section>;
  return <section className="tracker-tv-visitor" aria-live="polite">
    <h2>{translator.t("tracker.findMe")}</h2>
    <p>{place.name}: {formatVisitorArrival({ place, arrival, now, locale, translator })}</p>
  </section>;
}

function TvAudioToggle({ chimes, toggle, translator }: { chimes: boolean; toggle: () => void; translator: Translator }) {
  const label = translator.t(chimes ? "tracker.audioOn" : "tracker.audioOff");
  return <button className="tracker-tv-audio" type="button" onClick={toggle} aria-pressed={chimes}>{label}</button>;
}

function TvArrivalNotice({ node, translator }: { node: RouteNode | null; translator: Translator }) {
  if (!node) return null;
  return <ArrivalNoticeCard node={node} translator={translator} large />;
}

function readSavedPlace(nodes: RouteNode[], save: (place: ChosenPlace | null) => void): () => void {
  if (!nodes.length) return () => undefined;
  try {
    const saved = window.localStorage.getItem("tracker:place");
    save(saved ? validateStoredPlace(JSON.parse(saved), nodes) : null);
  } catch {
    save(null);
  }
  return () => undefined;
}

function showArrivalOnStopChange(current: number | null, previous: { current: number | null }, nodes: RouteNode[], show: (node: RouteNode | null) => void): void {
  if (hasPreviousStopChanged(current, previous.current)) show(nodes[current] ?? null);
  previous.current = current;
}

function hasPreviousStopChanged(current: number | null, previous: number | null): current is number {
  if (current === null) return false;
  if (previous === null) return false;
  return current !== previous;
}

function clearArrivalCard(node: RouteNode | null, chimes: boolean, clear: (node: RouteNode | null) => void): () => void {
  if (!node) return () => undefined;
  playArrivalNoticeChime(chimes);
  const timeout = window.setTimeout(() => clear(null), 6500);
  return () => window.clearTimeout(timeout);
}

function keepScreenAwake(lock: { current: WakeLockSentinel | null }): () => void {
  const request = async () => {
    if (document.visibilityState !== "visible" || lock.current) return;
    try {
      lock.current = await (navigator as WakeLockNavigator).wakeLock?.request("screen") ?? null;
    } catch { /* Wake Lock is optional. */ }
  };
  const release = () => {
    const active = lock.current;
    lock.current = null;
    if (active && !active.released) void active.release().catch(() => undefined);
  };
  const onVisibilityChange = () => {
    release();
    if (document.visibilityState === "visible") void request();
  };
  const onGesture = () => { void request(); };
  void request();
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    release();
  };
}

function formatVisitorArrival({ place, arrival, now, locale, translator }: ArrivalDisplayInput): string {
  if (!arrival) return translator.t("tracker.complete");
  if (arrival.getTime() <= now.getTime()) return translator.t("tracker.hesHereTitle");
  try {
    return translator.t("tracker.arrivalEstimate", { time: arrival.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", ...(place.timezone ? { timeZone: place.timezone } : {}) }) });
  } catch {
    return translator.t("tracker.arrivalEstimate", { time: arrival.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) });
  }
}
