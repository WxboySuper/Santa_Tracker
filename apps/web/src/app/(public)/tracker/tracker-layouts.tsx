import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import type { SantaPosition } from "@/lib/tracker-position";
import type { TrackerLayoutId } from "@/lib/tracker-layout";
import type { TrackerThemeId } from "@/lib/tracker-theme";
import { formatNumber, journeyStats, type JourneyStats, type StopLine } from "@/lib/tracker-journey-stats";
import { localDayHour, localTimeAt, shortDuration } from "@/lib/tracker-local-time";
import { christmasInJanuary, festiveMoment, greetingFor } from "@/lib/tracker-festive";
import { bearingBetween } from "@/lib/tracker-map-geometry";
import { useTrackerNow } from "@/lib/use-tracker-now";
import { JourneyCard } from "./tracker-chrome";
import "./tracker-layouts.css";

type Translator = ReturnType<typeof createTranslator>;

interface LayoutProps {
  layout: TrackerLayoutId;
  theme: TrackerThemeId;
  nodes: RouteNode[];
  timedNodes: RouteNode[];
  position: SantaPosition | null;
  status: string;
  translator: Translator;
  locale: string;
}

interface Flight {
  stats: JourneyStats;
  now: number;
  current: RouteNode;
  next?: RouteNode;
  atStop: boolean;
  position: SantaPosition;
}

function departure(node: RouteNode): number {
  return node.schedule?.departure_utc ? Date.parse(node.schedule.departure_utc) : Number.NaN;
}

function arrival(node: RouteNode): number {
  return node.schedule?.arrival_utc ? Date.parse(node.schedule.arrival_utc) : Number.NaN;
}

/** The in-flight state the layouts draw, or null before takeoff, after landing, or while loading. */
function flightState(nodes: RouteNode[], timedNodes: RouteNode[], position: SantaPosition | null, now: number): Flight | null {
  const takeoff = departure(nodes[0] ?? ({} as RouteNode));
  if (!position || (Number.isFinite(takeoff) && now < takeoff) || position.journey.progress >= 1) return null;
  const index = position.journey.currentIndex;
  const current = index === null ? undefined : timedNodes[index];
  if (!current || current.type === "END") return null;
  const candidate = position.journey.nextIndex === null ? undefined : timedNodes[position.journey.nextIndex];
  return {
    stats: journeyStats(timedNodes, position, now),
    now,
    current,
    next: candidate?.type === "DELIVERY" ? candidate : undefined,
    atStop: now < departure(current),
    position,
  };
}

function place(node: RouteNode): string {
  return node.location.region ? `${node.location.name}, ${node.location.region}` : node.location.name;
}

function StatsRow({ flight, translator, className }: { flight: Flight; translator: Translator; className: string }) {
  const { stats } = flight;
  const items: [string, string][] = [
    [translator.t("tracker.stats.stops"), `${formatNumber(stats.done)} / ${formatNumber(stats.total)}`],
    [translator.t("tracker.stats.countries"), formatNumber(stats.countries)],
    [translator.t("tracker.stats.distance"), translator.t("tracker.stats.km", { value: formatNumber(stats.distanceKm) })],
    [translator.t("tracker.stats.speed"), stats.speedKmh ? translator.t("tracker.stats.kmh", { value: formatNumber(stats.speedKmh) }) : translator.t("tracker.stats.landed")],
  ];
  return <dl className={className} aria-label={translator.t("tracker.stats.label")}>
    {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function nextLine(flight: Flight, translator: Translator): string | null {
  if (!flight.next) return null;
  return `${translator.t("tracker.card.next", { location: flight.next.location.name })} · ${shortDuration(arrival(flight.next) - flight.now)}`;
}

/** "Thu 24 Dec, 15:55" in UTC: the night spans two dates, so the date is part of the time. */
function utcClock(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at);
}

/** Globe, left edge: where Santa is right now and the headline numbers. */
function NowPanel({ flight, translator }: { flight: Flight; translator: Translator }) {
  const { stats, current, now } = flight;
  const cells: [string, string][] = [
    [translator.t("tracker.stats.stops"), `${formatNumber(stats.done)} / ${formatNumber(stats.total)}`],
    [translator.t("tracker.stats.countries"), formatNumber(stats.countries)],
    [translator.t("tracker.stats.distance"), translator.t("tracker.stats.km", { value: formatNumber(stats.distanceKm) })],
    [translator.t("tracker.stats.speed"), stats.speedKmh ? translator.t("tracker.stats.kmh", { value: formatNumber(stats.speedKmh) }) : translator.t("tracker.stats.landed")],
  ];
  return <section className="tl-panel tl-panel-now" aria-label={translator.t("tracker.card.label")}>
    <p className="tl-panel-kicker">{translator.t("tracker.globe.kicker", { time: utcClock(now) })}</p>
    <p className="tl-panel-status">{translator.t(flight.atStop ? "tracker.card.atStop" : "tracker.card.justLeft")}</p>
    <h2 className="tl-panel-title">{current.location.name}</h2>
    <p className="tl-panel-sub">{current.location.region}</p>
    {flight.next && <p className="tl-panel-next">
      <span className="tl-next-label">{translator.t("tracker.card.nextShort")}</span>
      <b>{flight.next.location.name}</b>
      <span className="tl-next-eta">{shortDuration(arrival(flight.next) - now)}</span>
    </p>}
    <dl className="tl-panel-stats">{cells.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </section>;
}

/** Globe, right edge: the festive side of the place Santa is over, and what is coming up. */
function HerePanel({ flight, translator }: { flight: Flight; translator: Translator }) {
  const { current, now, stats } = flight;
  const code = (current.location as { country_code?: string }).country_code;
  const greeting = greetingFor(code);
  const { day, hour } = localDayHour(current, now);
  const moment = festiveMoment(day, hour);
  return <section className="tl-panel tl-panel-here" aria-label={translator.t("tracker.here.label")}>
    <p className="tl-panel-kicker">{translator.t(`tracker.here.${moment}`, { time: localTimeAt(current, now) })}</p>
    <p className="tl-greeting" lang={greeting.language === "English" ? "en" : undefined}>{greeting.text}</p>
    <p className="tl-panel-sub">{translator.t("tracker.here.in", { language: greeting.language })}</p>
    {christmasInJanuary(code) && <p className="tl-panel-note">{translator.t("tracker.here.january")}</p>}
    {stats.upcoming.length > 0 && <>
      <h3 className="tl-panel-heading">{translator.t("tracker.feed.upcoming")}</h3>
      <ol className="tl-panel-list">
        {stats.upcoming.slice(0, 4).map(line => <li key={line.node.id}><span>{line.node.location.name}</span><span className="tl-li-time">{line.local}</span></li>)}
      </ol>
    </>}
  </section>;
}

/** Globe: two compact panels in the top corners; the middle of the screen stays clear for Santa and his route. */
function GlobeChrome({ flight, translator }: { flight: Flight; translator: Translator }) {
  return <>
    <NowPanel flight={flight} translator={translator} />
    <HerePanel flight={flight} translator={translator} />
  </>;
}

function FeedItem({ line, now, translator }: { line: StopLine; now: number; translator: Translator }) {
  return <li>
    <span className="tl-feed-name">{line.node.location.name}</span>
    <span className="tl-feed-meta">{line.node.location.region} · {line.local}</span>
    <span className="tl-feed-time">{translator.t("tracker.feed.ago", { time: shortDuration(now - line.at) })}</span>
  </li>;
}

/** Map + live feed: headline counters across the top and a running list of stops down the right. */
function FeedChrome({ flight, translator }: { flight: Flight; translator: Translator }) {
  const { stats } = flight;
  return <>
    <StatsRow flight={flight} translator={translator} className="tl-stats tl-stats-top" />
    <aside className="tl-feed" aria-label={translator.t("tracker.feed.latest")}>
      <div className="tl-feed-now">
        <p>{translator.t(flight.atStop ? "tracker.card.atStop" : "tracker.card.justLeft")}</p>
        <h2>{place(flight.current)}</h2>
        <p>{translator.t("tracker.card.local", { time: localTimeAt(flight.current, flight.now) })}</p>
        {nextLine(flight, translator) && <p className="tl-feed-next">{nextLine(flight, translator)}</p>}
      </div>
      <h3>{translator.t("tracker.feed.latest")}</h3>
      {stats.recent.length ? <ol className="tl-feed-list">{stats.recent.map(line => <FeedItem key={line.node.id} line={line} now={flight.now} translator={translator} />)}</ol> : <p className="tl-feed-empty">{translator.t("tracker.feed.empty")}</p>}
    </aside>
  </>;
}

function compass(degrees: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8] ?? "N";
}

/** Flight tracker: a detail panel down the left, like a plane-tracking app, with the route ahead. */
function FlightChrome({ flight, translator }: { flight: Flight; translator: Translator }) {
  const { stats, current, next, now } = flight;
  const heading = next ? Math.round(((bearingBetween(flight.position, next.location) * 180) / Math.PI + 360) % 360) : null;
  const legStart = departure(current);
  const legEnd = next ? arrival(next) : legStart;
  const legProgress = next && legEnd > legStart ? Math.min(1, Math.max(0, (now - legStart) / (legEnd - legStart))) : 1;
  return <aside className="tl-flight" aria-label={translator.t("tracker.card.label")}>
    <header>
      <h2>{translator.t("tracker.flight.callsign")}</h2>
      <p>{translator.t("tracker.flight.route")}</p>
    </header>
    <div className="tl-flight-leg">
      <div className="tl-leg-end">
        <span>{translator.t("tracker.flight.from")}</span>
        <b>{current.location.name}</b>
        <small>{current.location.region}</small>
        <small>{translator.t("tracker.flight.arrived", { time: localTimeAt(current, arrival(current)) })}</small>
      </div>
      <div className="tl-leg-end">
        <span>{translator.t("tracker.flight.to")}</span>
        <b>{next?.location.name ?? "-"}</b>
        <small>{next?.location.region}</small>
        {next && <small>{translator.t("tracker.flight.eta", { time: localTimeAt(next, arrival(next)) })}</small>}
      </div>
    </div>
    <div className="tl-flight-progress" role="progressbar" aria-label={translator.t("tracker.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(legProgress * 100)}>
      <span style={{ width: `${legProgress * 100}%` }} />
      <i style={{ left: `${legProgress * 100}%` }} aria-hidden="true" />
    </div>
    <StatsRow flight={flight} translator={translator} className="tl-stats tl-stats-grid" />
    {heading !== null && <p className="tl-flight-heading">{translator.t("tracker.stats.heading")} <b>{compass(heading)} {heading}°</b></p>}
    <h3>{translator.t("tracker.feed.upcoming")}</h3>
    <ol className="tl-flight-upcoming">
      {stats.upcoming.map(line => <li key={line.node.id} className="tl-up"><span>{line.node.location.name}</span><span>{line.local}</span></li>)}
    </ol>
  </aside>;
}

const TIMELINE_PX_PER_MINUTE = 9;

function hourMarks(start: number, end: number): number[] {
  const first = Math.ceil(start / 3_600_000) * 3_600_000;
  const marks: number[] = [];
  for (let at = first; at <= end; at += 3_600_000) marks.push(at);
  return marks;
}

function utcHour(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(at);
}

/** Night timeline: the whole night as a strip under the map, scrolling past a fixed "now" line. */
function TimelineChrome({ flight, timedNodes, translator }: { flight: Flight; timedNodes: RouteNode[]; translator: Translator }) {
  const { stats, current, now } = flight;
  const stops = timedNodes.filter(node => node.type === "DELIVERY");
  const start = departure(timedNodes[0] ?? current) || arrival(stops[0] ?? current);
  const end = arrival(timedNodes.at(-1) ?? current) || arrival(stops.at(-1) ?? current);
  const x = (at: number) => ((at - start) / 60_000) * TIMELINE_PX_PER_MINUTE;
  const width = x(end) + 1;
  const where = translator.t(flight.atStop ? "tracker.globe.at" : "tracker.globe.over", { location: place(current) });
  return <section className="tl-timeline" aria-label={translator.t("tracker.card.label")}>
    <div className="tl-timeline-head">
      <p><strong>{where}</strong> <span className="tl-soft">{translator.t("tracker.card.local", { time: localTimeAt(current, now) })}</span>{nextLine(flight, translator) && <span className="tl-soft"> · {nextLine(flight, translator)}</span>}</p>
      <p className="tl-timeline-count">{translator.t("tracker.card.stops", { done: stats.done, total: stats.total })} · {translator.t("tracker.stats.km", { value: formatNumber(stats.distanceKm) })}</p>
    </div>
    <div className="tl-timeline-window" aria-hidden="true">
      <div className="tl-timeline-track" style={{ width: `${width}px`, transform: `translateX(${-x(now)}px)` }}>
        <span className="tl-timeline-past" style={{ width: `${Math.max(0, x(now))}px` }} />
        {hourMarks(start, end).map(at => <span key={at} className="tl-timeline-hour" style={{ left: `${x(at)}px` }}>{utcHour(at)} UTC</span>)}
        {stops.map((node, i) => {
          const at = arrival(node);
          return <span key={node.id} className={at <= now ? "tl-timeline-stop tl-done" : "tl-timeline-stop"} style={{ left: `${x(at)}px` }} data-row={i % 3}>
            <i />{node.location.name}
          </span>;
        })}
      </div>
      <span className="tl-timeline-now" />
    </div>
  </section>;
}

/** Chooses the layout's on-screen parts. Before takeoff and after landing every layout shows the plain card. */
export function LayoutChrome(props: LayoutProps) {
  const now = useTrackerNow().getTime();
  const flight = props.layout === "card" ? null : flightState(props.nodes, props.timedNodes, props.position, now);
  if (!flight) return <JourneyCard theme={props.theme} nodes={props.nodes} timedNodes={props.timedNodes} position={props.position} status={props.status} translator={props.translator} locale={props.locale} />;
  if (props.layout === "globe") return <GlobeChrome flight={flight} translator={props.translator} />;
  if (props.layout === "feed") return <FeedChrome flight={flight} translator={props.translator} />;
  if (props.layout === "timeline") return <TimelineChrome flight={flight} timedNodes={props.timedNodes} translator={props.translator} />;
  return <FlightChrome flight={flight} translator={props.translator} />;
}
