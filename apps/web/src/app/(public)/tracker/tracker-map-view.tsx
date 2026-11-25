import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject } from "react";
import type { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import { routeNodesToContractRoute } from "@/lib/route-bridge";
import type { SantaPosition } from "@/lib/tracker-position";
import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import type { TrackerViewMode } from "@/lib/tracker-view-mode";
import type { MapEvent, MapMode } from "./tracker-map-hooks";
import { ImmersiveTrackerOverlays } from "./tracker-map-immersive";
import { TvTrackerDashboard } from "./tracker-map-tv";
import { TrackerToolbar } from "./tracker-chrome";
import type { TrackerThemeId } from "@/lib/tracker-theme";
import type { TrackerLayoutId } from "@/lib/tracker-layout";
import { GlobeView } from "@/components/tracker-globe/globe-view";
import { LayoutChrome } from "./tracker-layouts";

type Translator = ReturnType<typeof createTranslator>;

/** Values shared by the standard and immersive tracker presentations. */
interface TrackerMapViewProps {
  theme: TrackerThemeId;
  layout: TrackerLayoutId;
  globe: boolean;
  onGlobeUnavailable: () => void;
  adventEnabled: boolean;
  locale: string;
  translator: Translator;
  element: RefObject<HTMLDivElement | null>;
  adapter: RefObject<TrackerMapAdapter | null>;
  mode: MapMode;
  dispatch: Dispatch<MapEvent>;
  nodes: RouteNode[];
  position: SantaPosition | null;
  current?: RouteNode;
  status: string;
  following: boolean;
  setFollowing: (value: boolean) => void;
  viewMode: TrackerViewMode;
  toggleImmersive: () => void;
  toggleTv: () => void;
}

/** Presents the route as a keyboard-readable text alternative. */
export function JourneyPanel({ nodes, position, translator, locale, tv = false }: { nodes: RouteNode[]; position: SantaPosition | null; translator: Translator; locale: string; tv?: boolean }) {
  const timedNodes = routeNodesToContractRoute(nodes).timedNodes;
  const currentIndex = position?.journey.currentIndex ?? null;
  const nextIndex = position?.journey.nextIndex ?? null;
  const current = currentIndex === null ? undefined : timedNodes[currentIndex];
  const next = nextIndex === null ? undefined : timedNodes[nextIndex];
  const recent = currentIndex === null ? [] : timedNodes.slice(Math.max(0, currentIndex - 4), currentIndex + 1).reverse();
  const sectionClass = tv ? "tracker-tv-map-text" : "tt-textview";
  // Focusable so keyboard users can scroll the text view on short screens (WCAG 2.1.1).
  return <section className={sectionClass} aria-label={translator.t("tracker.textMode")} tabIndex={tv ? undefined : 0}>
    <dl className="mx-auto max-w-xl space-y-4">
      <div><dt>{translator.t("tracker.current")}</dt><dd className="text-2xl font-bold">{current?.location.name ?? translator.t("tracker.notStarted")}</dd></div>
      <div><dt>{translator.t("tracker.next")}</dt><dd>{next?.location.name ?? translator.t("tracker.complete")}</dd></div>
      <div><dt>{translator.t("tracker.arrival")}</dt><dd>{next?.schedule?.arrival_utc ? new Date(next.schedule.arrival_utc).toLocaleString(locale) : translator.t("tracker.unknown")}</dd></div>
      <div><dt>{translator.t("tracker.progress")}</dt><dd>{Math.round((position?.journey.progress ?? 0) * 100)}%</dd></div>
    </dl>
    <div className="mx-auto mt-6 max-w-xl"><h2 className="font-bold">{translator.t("tracker.recent")}</h2><ul>{recent.map(node => <li key={node.id}>{node.location.name}</li>)}</ul></div>
  </section>;
}

/** Renders the standard site's navigation links. */
function TrackerNav({ adventEnabled, translator }: { adventEnabled: boolean; translator: Translator }) {
  return <nav className="tt-nav">
    <Link href="/" className="tt-nav-link">{translator.t("nav.home")}</Link>
    <Link href="/tracker" className="tt-nav-link tt-nav-active" aria-current="page">{translator.t("nav.tracker")}</Link>
    {adventEnabled && <Link href="/advent" className="tt-nav-link">{translator.t("nav.village")}</Link>}
  </nav>;
}

/** Hides immersive controls after idle and restores them on activity. */
function useIdleControls(viewMode: TrackerViewMode, stageRef: RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const wake = useCallback(() => { setVisible(true); setActivity(value => value + 1); }, []);
  useEffect(() => {
    if (viewMode !== "immersive") { setVisible(true); return; }
    const timer = window.setTimeout(() => {
      if (focusedControlWithin(stageRef)) return;
      setVisible(false);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [activity, stageRef, viewMode]);
  return { visible, wake };
}

function focusedControlWithin(stageRef: RefObject<HTMLDivElement | null>): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (!stageRef.current?.contains(active)) return false;
  return active.closest(".tracker-controls") !== null;
}

/** Restores controls for keyboard input and handles the immersive Escape key. */
interface TrackerKeyContext {
  event: React.KeyboardEvent<HTMLDivElement>;
  wake: () => void;
  immersive: boolean;
  toggle: () => void;
  tv: boolean;
}

function handleTrackerKey({ event, wake, immersive, toggle, tv }: TrackerKeyContext): void {
  wake();
  if (tv) {
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (event.key !== "Escape") return;
  if (!immersive) return;
  const target = event.target;
  const tagName = target instanceof HTMLElement ? target.tagName : "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
  toggle();
}

/** Exits TV mode on Escape or the back key used by some remotes. */
function useTvKeyboardExit(tv: boolean, toggleTv: () => void): void {
  useEffect(() => {
    if (!tv) return;
    const exit = (event: KeyboardEvent) => {
      if (!isBackKey(event.key)) return;
      event.preventDefault();
      toggleTv();
    };
    document.addEventListener("keydown", exit);
    return () => document.removeEventListener("keydown", exit);
  }, [toggleTv, tv]);
}

function isBackKey(key: string): boolean {
  return key === "Escape" || key === "BrowserBack" || key === "GoBack";
}

/** Composes the standard map, text view, and immersive tracker presentation. */
export function TrackerMapView(props: TrackerMapViewProps) {
  const { theme, layout, globe, onGlobeUnavailable, adventEnabled, locale, translator, element, adapter, mode, dispatch, nodes, position, current, status, following, setFollowing, viewMode, toggleImmersive, toggleTv } = props;
  const immersive = viewMode === "immersive";
  const tv = viewMode === "tv";
  const stageRef = useRef<HTMLDivElement>(null);
  // The journey indexes stops that have a schedule. START has none, so index the same list here or the TV and immersive views show the wrong stop.
  const timedNodes = useMemo(() => routeNodesToContractRoute(nodes).timedNodes, [nodes]);
  const { visible, wake } = useIdleControls(viewMode, stageRef);
  useTvKeyboardExit(tv, toggleTv);
  return <>
    <TrackerNavigation adventEnabled={adventEnabled} immersive={immersive || tv} translator={translator} />
    <div ref={stageRef} className={stageClass(viewMode)} onPointerMove={wake} onPointerDown={wake} onFocusCapture={wake} onBlurCapture={wake} onKeyDownCapture={event => handleTrackerKey({ event, wake, immersive, toggle: toggleImmersive, tv })}>
      {tv ? <div className="tracker-tv-layout">
        <div className="tracker-tv-map">
          <MapSurface mode={mode} tv element={element} nodes={nodes} position={position} translator={translator} locale={locale} />
          <TvMapAttribution translator={translator} />
        </div>
        <TvTrackerDashboard locale={locale} nodes={timedNodes} position={position} translator={translator} />
        <button className="tracker-tv-exit" type="button" onClick={toggleTv}>{translator.t("tracker.exitTv")}</button>
      </div> : <>
        {globe && mode !== "text"
          ? <GlobeView nodes={timedNodes} position={position} adapter={adapter} label={translator.t("tracker.mapLabel")} onStopFollowing={() => setFollowing(false)} onUnavailable={onGlobeUnavailable} />
          : <MapSurface mode={mode} element={element} nodes={nodes} position={position} translator={translator} locale={locale} />}
        <TrackerToolbar mode={mode} following={following} dispatch={dispatch} translator={translator} adapter={adapter} setFollowing={setFollowing} immersive={immersive} hidden={immersive && !visible} toggleImmersive={toggleImmersive} toggleTv={toggleTv} />
        <MapInstructions mode={mode} translator={translator} />
        <TrackerStatus current={current} translator={translator} />
        {immersive
          ? <ImmersiveTrackerOverlays locale={locale} nodes={timedNodes} position={position} current={current} translator={translator} controlsVisible={visible} />
          : <LayoutChrome layout={layout} theme={theme} nodes={nodes} timedNodes={timedNodes} position={position} status={status} translator={translator} locale={locale} />}
      </>}
    </div>
  </>;
}

/** Hides site navigation while immersive mode owns the screen. */
function TrackerNavigation({ adventEnabled, immersive, translator }: { adventEnabled: boolean; immersive: boolean; translator: Translator }) {
  if (immersive) return null;
  return <TrackerNav adventEnabled={adventEnabled} translator={translator} />;
}

/** Credits the map data providers while remaining visible on the television map. */
function TvMapAttribution({ translator }: { translator: Translator }) {
  return <div className="tracker-tv-map-attribution" role="group" aria-label={translator.t("tracker.mapAttributionLabel")}>
    <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">{translator.t("tracker.mapAttributionProvider")}</a>
    <span aria-hidden="true"> · </span>
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{translator.t("tracker.mapAttributionData")}</a>
  </div>;
}

/** Applies the stage sizing and night scene class. */
function stageClass(viewMode: TrackerViewMode): string {
  if (viewMode === "tv") return "tracker-stage tracker-tv relative min-h-screen w-full";
  return viewMode === "immersive" ? "tracker-stage tracker-immersive relative h-screen w-screen" : "tracker-stage relative h-screen w-screen";
}

/** Selects the interactive map or text route surface. */
function MapSurface({ mode, element, nodes, position, translator, locale, tv = false }: { mode: MapMode; element: RefObject<HTMLDivElement | null>; nodes: RouteNode[]; position: SantaPosition | null; translator: Translator; locale: string; tv?: boolean }) {
  if (mode === "text") return <JourneyPanel nodes={nodes} position={position} translator={translator} locale={locale} tv={tv} />;
  return <div ref={element} className="h-full w-full bg-blue-950 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" aria-label={translator.t("tracker.mapLabel")} aria-describedby={tv ? undefined : "map-instructions"} role="application" tabIndex={0} />;
}

/** Displays map keyboard instructions when the map is visible. */
function MapInstructions({ mode, translator }: { mode: MapMode; translator: Translator }) {
  if (mode === "text") return null;
  return <p id="map-instructions" className="sr-only">{translator.t("tracker.instructions")}</p>;
}

/** Announces current stop changes to screen readers; loading status is shown in the journey card. */
function TrackerStatus({ current, translator }: { current?: RouteNode; translator: Translator }) {
  const announcement = current ? translator.t("tracker.announcement", { location: current.location.name }) : "";
  return <p className="sr-only" aria-live="polite">{announcement}</p>;
}
