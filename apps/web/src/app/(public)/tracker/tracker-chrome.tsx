import type { Dispatch, ReactNode, RefObject } from "react";
import Countdown from "@/components/countdown";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import { localTimeAt, shortDuration } from "@/lib/tracker-local-time";
import { haversineKm } from "@santa-tracker/route-engine";
import type { TrackerThemeId } from "@/lib/tracker-theme";
import { useTrackerNow } from "@/lib/use-tracker-now";
import type { MapEvent, MapMode } from "./tracker-map-hooks";
import "./tracker-themes.css";

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
    <button type="button" className="tt-tool" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

/** One row of icon buttons for every way of watching; labels show on hover and to screen readers. */
export function TrackerToolbar({ mode, following, dispatch, translator, adapter, setFollowing, immersive, hidden, toggleImmersive, toggleTv }: ToolbarProps) {
  const text = mode === "text";
  const switchMode = () => { dispatch(text ? "showMap" : "showText"); setFollowing(true); };
  const returnToSanta = () => { adapter.current?.follow(); setFollowing(true); };
  const visitPole = () => { adapter.current?.visitPole(); setFollowing(false); };
  return (
    <div className="tt-toolbar" role="toolbar" aria-label={translator.t("tracker.toolbar")}>
      {/* These fade with the other immersive controls after idle; the immersive toggle below never does, so it stays reachable. */}
      <div className={hidden ? "tracker-controls tracker-controls-hidden tt-toolbar-group" : "tracker-controls tt-toolbar-group"}>
        {!text && !following && <ToolButton icon="target" label={translator.t("tracker.return")} onClick={returnToSanta} />}
        <ToolButton icon={text ? "map" : "list"} label={translator.t(text ? "tracker.mapMode" : "tracker.textMode")} onClick={switchMode} />
        {!text && <ToolButton icon="star" label={translator.t("tracker.northPole")} onClick={visitPole} />}
      </div>
      <ToolButton icon={immersive ? "shrink" : "expand"} label={translator.t(immersive ? "tracker.exitImmersive" : "tracker.immersive")} onClick={toggleImmersive} />
      {!immersive && <ToolButton icon="tv" label={translator.t("tracker.tv")} onClick={toggleTv} />}
    </div>
  );
}

function timeOf(stamp: string | null | undefined): number {
  return stamp ? Date.parse(stamp) : Number.NaN;
}

interface Flying {
  kind: "flying";
  current: RouteNode;
  next?: RouteNode;
  atStop: boolean;
  done: number;
  total: number;
  progress: number;
  localTime: string;
  nextIn?: string;
  speedKmh?: number;
}

type JourneyInfo = { kind: "loading" } | { kind: "before" } | { kind: "home"; total: number } | Flying;

function legSpeed(current: RouteNode, next: RouteNode | undefined): number | undefined {
  if (!next) return undefined;
  const hours = (timeOf(next.schedule?.arrival_utc) - timeOf(current.schedule?.departure_utc)) / 3_600_000;
  if (!(hours > 0)) return undefined;
  return Math.round(haversineKm(current.location, next.location) / hours);
}

function flyingInfo(timedNodes: RouteNode[], position: SantaPosition, now: number, total: number, deliveries: RouteNode[]): JourneyInfo {
  const index = position.journey.currentIndex;
  const current = index === null ? undefined : timedNodes[index];
  if (!current || current.type === "END" || position.journey.progress >= 1) return { kind: "home", total };
  const nextIndex = position.journey.nextIndex;
  const candidate = nextIndex === null ? undefined : timedNodes[nextIndex];
  const next = candidate?.type === "DELIVERY" ? candidate : undefined;
  const departure = timeOf(current.schedule?.departure_utc);
  const done = deliveries.filter(node => timeOf(node.schedule?.arrival_utc) <= now).length;
  return {
    kind: "flying",
    current,
    next,
    atStop: Number.isFinite(departure) && now < departure,
    done,
    total,
    progress: done / total,
    localTime: localTimeAt(current, now),
    nextIn: next ? shortDuration(timeOf(next.schedule?.arrival_utc) - now) : undefined,
    speedKmh: legSpeed(current, candidate),
  };
}

function journeyInfo(nodes: RouteNode[], timedNodes: RouteNode[], position: SantaPosition | null, now: number): JourneyInfo {
  const deliveries = timedNodes.filter(node => node.type === "DELIVERY");
  const total = deliveries.length;
  if (!total) return { kind: "loading" };
  const takeoff = timeOf(nodes[0]?.schedule?.departure_utc);
  if (Number.isFinite(takeoff) && now < takeoff) return { kind: "before" };
  if (!position) return { kind: "home", total };
  return flyingInfo(timedNodes, position, now, total, deliveries);
}

type CardProps = { info: Flying; translator: Translator };

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="tt-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><span style={{ width: `${Math.max(2, Math.round(value * 100))}%` }} /></div>;
}

function eyebrow(info: Flying, translator: Translator): string {
  return translator.t(info.atStop ? "tracker.card.atStop" : "tracker.card.justLeft");
}

function QuietCard({ info, translator }: CardProps) {
  return <>
    <p className="tt-eyebrow">{eyebrow(info, translator)}</p>
    <h2 className="tt-title">{info.current.location.name}</h2>
    <p className="tt-sub">{info.current.location.region ? `${info.current.location.region} · ` : ""}{translator.t("tracker.card.local", { time: info.localTime })}</p>
    {info.next && <p className="tt-next">{translator.t("tracker.card.next", { location: info.next.location.name })} · {info.nextIn}</p>}
    <div className="tt-foot">
      <Progress value={info.progress} label={translator.t("tracker.progress")} />
      <span>{translator.t("tracker.card.stops", { done: info.done, total: info.total })}</span>
    </div>
  </>;
}

function ArcadeCard({ info, translator }: CardProps) {
  return <>
    <span className="tt-badge">{info.done} / {info.total}</span>
    <p className="tt-eyebrow">{eyebrow(info, translator)}</p>
    <h2 className="tt-title">{info.current.location.name}</h2>
    <div className="tt-chips">
      <span className="tt-chip">{translator.t("tracker.card.local", { time: info.localTime })}</span>
      {info.next && <span className="tt-chip tt-chip-alt">{translator.t("tracker.card.next", { location: info.next.location.name })} · {info.nextIn}</span>}
    </div>
    <Progress value={info.progress} label={translator.t("tracker.progress")} />
  </>;
}

function RadarCard({ info, translator }: CardProps) {
  const place = info.atStop || !info.next ? info.current.location.name : translator.t("tracker.card.between", { from: info.current.location.name, to: info.next.location.name });
  const rows: [string, string][] = [
    [translator.t("tracker.card.lastStop"), `${info.current.location.name} ${info.localTime}`],
    [translator.t("tracker.card.nextShort"), info.next ? `${info.next.location.name} · ${info.nextIn}` : "-"],
    [translator.t("tracker.card.speed"), info.speedKmh ? `${info.speedKmh.toLocaleString("en-GB")} km/h` : "-"],
    [translator.t("tracker.card.delivered"), `${info.done} / ${info.total}`],
  ];
  return <>
    <p className="tt-eyebrow">{translator.t("tracker.card.position")}</p>
    <h2 className="tt-title">{place}</h2>
    <dl className="tt-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </>;
}

function LinoCard({ info, translator }: CardProps) {
  return <>
    <p className="tt-eyebrow">{eyebrow(info, translator)}</p>
    <h2 className="tt-title">{info.current.location.name}</h2>
    <p className="tt-sub">{translator.t("tracker.card.local", { time: info.localTime })}{info.next ? ` · ${translator.t("tracker.card.next", { location: info.next.location.name })} · ${info.nextIn}` : ""}</p>
    <Progress value={info.progress} label={translator.t("tracker.progress")} />
    <span className="tt-stamp">{translator.t("tracker.card.stops", { done: info.done, total: info.total })}</span>
  </>;
}

function code(name: string): string {
  return name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "---";
}

function PosterCard({ info, translator }: CardProps) {
  return <div className="tt-pass">
    <div className="tt-pass-main">
      <p className="tt-eyebrow">{translator.t("tracker.card.flight")}</p>
      <div className="tt-pass-route">
        <div><b>{code(info.current.location.name)}</b><span>{info.current.location.name}</span></div>
        <i aria-hidden="true" />
        <div><b>{info.next ? code(info.next.location.name) : "NP"}</b><span>{info.next?.location.name ?? translator.t("tracker.northPole")}</span></div>
      </div>
      <dl className="tt-pass-cols">
        <div><dt>{translator.t("tracker.card.localLabel")}</dt><dd>{info.localTime}</dd></div>
        <div><dt>{translator.t("tracker.card.arrives")}</dt><dd>{info.nextIn ?? "-"}</dd></div>
        <div><dt>{translator.t("tracker.card.seat")}</dt><dd>{translator.t("tracker.card.sleigh")}</dd></div>
      </dl>
    </div>
    <div className="tt-pass-stub">
      <span>{translator.t("tracker.card.stop")}</span><b>{info.done}</b><span>{translator.t("tracker.card.ofTotal", { total: info.total })}</span>
      <i className="tt-barcode" aria-hidden="true" />
    </div>
  </div>;
}

function KnitCard({ info, translator }: CardProps) {
  const filled = Math.round(info.progress * 14);
  return <>
    <p className="tt-eyebrow">{eyebrow(info, translator)}</p>
    <h2 className="tt-title">{info.current.location.name}</h2>
    <p className="tt-sub">{translator.t("tracker.card.local", { time: info.localTime })}</p>
    {info.next && <p className="tt-sub">{translator.t("tracker.card.next", { location: info.next.location.name })} · {info.nextIn}</p>}
    <p className="tt-sub">{translator.t("tracker.card.stops", { done: info.done, total: info.total })}</p>
    <p className="tt-stitches" aria-hidden="true">{"■".repeat(filled)}{"□".repeat(14 - filled)}</p>
  </>;
}

const CARDS: Record<TrackerThemeId, (props: CardProps) => ReactNode> = {
  night: QuietCard,
  day: QuietCard,
  arcade: ArcadeCard,
  radar: RadarCard,
  lino: LinoCard,
  poster: PosterCard,
  knit: KnitCard,
};

/** Theme decorations around the map: the radar's LIVE badge and ticker, the poster's title band, the jumper's bands. */
function ThemeDecor({ theme, info, translator }: { theme: TrackerThemeId; info: JourneyInfo; translator: Translator }) {
  if (theme === "radar") {
    const ticker = info.kind === "flying"
      ? [translator.t("tracker.card.deliveredAt", { location: info.current.location.name, time: info.localTime }), info.next ? translator.t("tracker.card.next", { location: info.next.location.name }) : "", translator.t("tracker.card.toGo", { count: info.total - info.done })].filter(Boolean)
      : [];
    return <>
      <p className="tt-live"><b>{"●"} {translator.t("tracker.card.live")}</b> {translator.t("tracker.card.ops")}</p>
      {ticker.length > 0 && <p className="tt-ticker"><b>{translator.t("tracker.card.now")}</b>{ticker.map(item => <span key={item}>{item}</span>)}</p>}
    </>;
  }
  if (theme === "poster") return <p className="tt-band" aria-hidden="true"><span>{translator.t("tracker.card.eve")}</span><b>{translator.t("tracker.card.title")}</b></p>;
  if (theme === "knit") return <><i className="tt-fairisle tt-fairisle-top" aria-hidden="true" /><i className="tt-fairisle tt-fairisle-bottom" aria-hidden="true" /></>;
  return null;
}

interface JourneyCardProps { theme: TrackerThemeId; nodes: RouteNode[]; timedNodes: RouteNode[]; position: SantaPosition | null; status: string; translator: Translator; locale: string }

/** The one panel in the standard tracker, drawn in the active theme, plus that theme's decorations. */
export function JourneyCard({ theme, nodes, timedNodes, position, status, translator, locale }: JourneyCardProps) {
  const now = useTrackerNow().getTime();
  const info = journeyInfo(nodes, timedNodes, position, now);
  const Card = CARDS[theme];
  return <>
    <ThemeDecor theme={theme} info={info} translator={translator} />
    <section className="tt-card" aria-label={translator.t("tracker.card.label")}>
      {info.kind === "loading" && <p className="tt-eyebrow">{status}</p>}
      {info.kind === "before" && <>
        <p className="tt-eyebrow">{translator.t("tracker.card.takeoffIn")}</p>
        <Countdown locale={locale} className="tt-title tt-countdown" flyingText={translator.t("countdown.flying")} />
      </>}
      {info.kind === "home" && <>
        <p className="tt-eyebrow">{translator.t("tracker.card.stops", { done: info.total, total: info.total })}</p>
        <h2 className="tt-title">{translator.t("tracker.card.home")}</h2>
        <p className="tt-sub">{translator.t("tracker.card.homeNote")}</p>
      </>}
      {info.kind === "flying" && <Card info={info} translator={translator} />}
    </section>
  </>;
}
