import type { Dispatch, ReactNode, RefObject } from "react";
import Countdown from "@/components/countdown";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { localTimeAt, shortDuration } from "@/lib/tracker-local-time";
import { useTrackerNow } from "@/lib/use-tracker-now";
import type { MapEvent, MapMode } from "./tracker-map-hooks";
import "./storybook.css";

type Translator = ReturnType<typeof createTranslator>;

const ICONS: Record<string, ReactNode> = {
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />,
  star: <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3Z" />,
  target: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
};

function ToolButton({ icon, label, onClick }: { icon: keyof typeof ICONS; label: string; onClick: () => void }) {
  return (
    <button type="button" className="storybook-tool" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[icon]}
      </svg>
    </button>
  );
}

interface ToolbarProps {
  mode: MapMode;
  following: boolean;
  dispatch: Dispatch<MapEvent>;
  translator: Translator;
  adapter: RefObject<TrackerMapAdapter | null>;
  setFollowing: (value: boolean) => void;
  immersive: boolean;
  hidden: boolean;
  toggleImmersive: () => void;
  toggleTv: () => void;
}

/** One small row of icon buttons for every way of watching; labels show on hover and to screen readers. */
export function TrackerToolbar({ mode, following, dispatch, translator, adapter, setFollowing, immersive, hidden, toggleImmersive, toggleTv }: ToolbarProps) {
  const text = mode === "text";
  const switchMode = () => { dispatch(text ? "showMap" : "showText"); setFollowing(true); };
  const returnToSanta = () => { adapter.current?.follow(); setFollowing(true); };
  const visitPole = () => { adapter.current?.visitPole(); setFollowing(false); };
  return (
    <div className={hidden ? "tracker-controls tracker-controls-hidden storybook-toolbar" : "tracker-controls storybook-toolbar"} role="toolbar" aria-label={translator.t("tracker.toolbar")}>
      {!text && !following && <ToolButton icon="target" label={translator.t("tracker.return")} onClick={returnToSanta} />}
      <ToolButton icon={text ? "map" : "list"} label={translator.t(text ? "tracker.mapMode" : "tracker.textMode")} onClick={switchMode} />
      {!text && <ToolButton icon="star" label={translator.t("tracker.northPole")} onClick={visitPole} />}
      <ToolButton icon={immersive ? "shrink" : "expand"} label={translator.t(immersive ? "tracker.exitImmersive" : "tracker.immersive")} onClick={toggleImmersive} />
      {!immersive && <ToolButton icon="tv" label={translator.t("tracker.tv")} onClick={toggleTv} />}
    </div>
  );
}

function timeOf(stamp: string | null | undefined): number {
  return stamp ? Date.parse(stamp) : Number.NaN;
}

type JourneyPhase =
  | { kind: "loading" }
  | { kind: "before" }
  | { kind: "home"; total: number }
  | { kind: "flying"; current: RouteNode; next?: RouteNode; atStop: boolean; done: number; total: number; progress: number };

function journeyPhase(nodes: RouteNode[], timedNodes: RouteNode[], position: SantaPosition | null, now: number): JourneyPhase {
  const deliveries = timedNodes.filter(node => node.type === "DELIVERY");
  const total = deliveries.length;
  if (!total) return { kind: "loading" };
  const takeoff = timeOf(nodes[0]?.schedule?.departure_utc);
  if (Number.isFinite(takeoff) && now < takeoff) return { kind: "before" };
  const index = position?.journey.currentIndex ?? null;
  const current = index === null ? undefined : timedNodes[index];
  if (!current || current.type === "END" || (position?.journey.progress ?? 0) >= 1) return { kind: "home", total };
  const nextIndex = position?.journey.nextIndex ?? null;
  const next = nextIndex === null ? undefined : timedNodes[nextIndex];
  const departure = timeOf(current.schedule?.departure_utc);
  const atStop = Number.isFinite(departure) ? now < departure : false;
  const done = deliveries.filter(node => timeOf(node.schedule?.arrival_utc) <= now).length;
  return { kind: "flying", current, next, atStop, done, total, progress: done / total };
}

/** The one panel in the standard tracker: where Santa is, the local time there, what is next, and how far along. */
export function JourneyCard({ nodes, timedNodes, position, status, translator, locale }: { nodes: RouteNode[]; timedNodes: RouteNode[]; position: SantaPosition | null; status: string; translator: Translator; locale: string }) {
  const now = useTrackerNow().getTime();
  const phase = journeyPhase(nodes, timedNodes, position, now);
  return (
    <section className="storybook-card" aria-label={translator.t("tracker.card.label")}>
      {phase.kind === "loading" && <p className="storybook-card-eyebrow">{status}</p>}
      {phase.kind === "before" && <>
        <p className="storybook-card-eyebrow">{translator.t("tracker.card.takeoffIn")}</p>
        <Countdown locale={locale} className="storybook-card-title storybook-card-countdown" flyingText={translator.t("countdown.flying")} />
      </>}
      {phase.kind === "home" && <>
        <p className="storybook-card-eyebrow">{translator.t("tracker.card.stops", { done: phase.total, total: phase.total })}</p>
        <h2 className="storybook-card-title">{translator.t("tracker.card.home")}</h2>
        <p className="storybook-card-sub">{translator.t("tracker.card.homeNote")}</p>
      </>}
      {phase.kind === "flying" && <>
        <p className="storybook-card-eyebrow">{translator.t(phase.atStop ? "tracker.card.atStop" : "tracker.card.justLeft")}</p>
        <h2 className="storybook-card-title">{phase.current.location.name}</h2>
        <p className="storybook-card-sub">
          {phase.current.location.region && <span>{phase.current.location.region}</span>}
          <span>{translator.t("tracker.card.local", { time: localTimeAt(phase.current, now) })}</span>
        </p>
        {phase.next && phase.next.type === "DELIVERY" && (
          <p className="storybook-card-next">
            {translator.t("tracker.card.next", { location: phase.next.location.name })}
            <span> · {translator.t("tracker.card.nextIn", { time: shortDuration(timeOf(phase.next.schedule?.arrival_utc) - now) })}</span>
          </p>
        )}
        <div className="storybook-card-progress" role="progressbar" aria-label={translator.t("tracker.progress")} aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
          <span style={{ width: `${Math.round(phase.progress * 100)}%` }} />
        </div>
        <p className="storybook-card-count">{translator.t("tracker.card.stops", { done: phase.done, total: phase.total })}</p>
      </>}
    </section>
  );
}
