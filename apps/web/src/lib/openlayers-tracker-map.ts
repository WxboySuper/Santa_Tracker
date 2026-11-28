import Map from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import OSM from "ol/source/OSM.js";
import VectorSource from "ol/source/Vector.js";
import { fromLonLat } from "ol/proj.js";
import type { Style } from "ol/style.js";
import { apply } from "ol-mapbox-style";
import type { RouteNode } from "./locations";
import type { SantaPosition } from "./tracker-position";
import type { TrackerMapAdapter } from "./tracker-map-adapter";
import { routeNodesToContractRoute } from "./route-bridge";
import { applyInitialCamera, bearingBetween, hasValidMapExtent, positionToView, splitGreatCircle } from "./tracker-map-geometry";
import { isMapInteractionKey } from "./tracker-map-adapter";
import { createPolarCapLayer, POLE_COORD, VIEW_EXTENT } from "./tracker-polar-cap";
import { styleDeadline } from "./tracker-map-timeout";
import { prefersLowPerformance } from "./device-capability";
import type { TrackerArt } from "../components/tracker-3d/tracker-art";
import { themedMapStyle, type MapStyleJson } from "./themed-map-style";
import { headingWest } from "./tracker-sleigh-icon";
import { activeTrackerTheme, type MapPalette, type TrackerTheme } from "./tracker-theme";
import { themeMapStyles, type ThemeMapStyles } from "./tracker-theme-styles";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const VECTOR_TIMEOUT_MS = 6000;
const TILE_ERROR_LIMIT = 4;

function drawLeg(source: VectorSource, from: { lat: number; lng: number }, to: { lat: number; lng: number }, style: Style | Style[]): void {
  for (const piece of splitGreatCircle(from, to)) {
    const line = new Feature(new LineString(piece.map(point => fromLonLat(positionToView(point)))));
    line.setStyle(style);
    source.addFeature(line);
  }
}

async function fetchThemedStyle(signal: AbortSignal, palette: MapPalette): Promise<MapStyleJson> {
  const response = await fetch(STYLE_URL, { signal });
  if (!response.ok) throw new Error(`Map style request failed: ${response.status}`);
  return themedMapStyle(await response.json() as MapStyleJson, palette);
}

export class StyleLoadError extends Error {
  override readonly name = "StyleLoadError";
}

export class OpenLayersTrackerMap implements TrackerMapAdapter {
  private map?: Map;
  private route = new VectorSource();
  private activeLeg = new VectorSource();
  private marker = new VectorSource();
  private stops = new VectorSource();
  private nodes: RouteNode[] = [];
  private position?: SantaPosition;
  private following = true;
  private disposed = false;
  private cleanupInput?: () => void;
  private cancelStyle?: () => void;
  private art?: TrackerArt;
  private readonly theme: TrackerTheme = activeTrackerTheme();
  private readonly styles: ThemeMapStyles = themeMapStyles(this.theme);

  constructor(
    private mode: "vector" | "raster",
    private onFailure: () => void,
    private onStopFollowing: () => void,
    private timeoutMs = VECTOR_TIMEOUT_MS,
  ) {}

  async mount(element: HTMLElement): Promise<void> {
    if (this.disposed) return;
    const map = new Map({ target: element, view: new View({ center: fromLonLat([0, 20]), zoom: 2, extent: VIEW_EXTENT }) });
    this.map = map;
    this.bindInput(element);
    if (this.mode === "vector") {
      try { await this.loadVector(map); }
      catch (error) {
        if (this.disposed) return;
        throw new StyleLoadError("Vector style failed", { cause: error });
      }
    }
    else this.loadRaster(map);
    if (this.disposed) return;
    map.addLayer(createPolarCapLayer());
    map.addLayer(new VectorLayer({ source: this.route }));
    map.addLayer(new VectorLayer({ source: this.activeLeg }));
    map.addLayer(new VectorLayer({ source: this.stops }));
    map.addLayer(new VectorLayer({ source: this.marker }));
    this.drawRoute();
    this.drawMarker();
    void this.mountArt(map);
    applyInitialCamera(Boolean(this.position), {
      centerOnSanta: () => this.centerSanta(),
      fitRoute: () => this.fitToRoute(),
    });
  }

  /** The 3D pole and sleigh are an enhancement; the plain marker stays if they cannot load. */
  private async mountArt(map: Map): Promise<void> {
    if (prefersLowPerformance()) return; // Constrained device or data saver: keep the plain marker.
    try {
      const { TrackerArt } = await import("../components/tracker-3d/tracker-art");
      if (this.disposed) return;
      const art = new TrackerArt(map);
      art.mount();
      this.art = art;
      this.drawMarker();
    } catch {
      // Keep the plain marker.
    }
  }

  private async loadVector(map: Map): Promise<void> {
    const deadline = styleDeadline(this.timeoutMs);
    const controller = new AbortController();
    this.cancelStyle = () => {
      controller.abort();
      deadline.cancel();
    };
    try {
      const load = fetchThemedStyle(controller.signal, this.theme.map).then(style => apply(map, style as unknown as object, { transformRequest: url => new Request(url, { signal: controller.signal }) }));
      await Promise.race([load, deadline.promise]);
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      deadline.clear();
      this.cancelStyle = undefined;
    }
  }

  private loadRaster(map: Map): void {
    const source = new OSM({ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" });
    let errors = 0;
    source.on("tileloaderror", () => {
      errors++;
      if (errors === TILE_ERROR_LIMIT) this.onFailure();
    });
    map.addLayer(new TileLayer({ source }));
  }

  private bindInput(element: HTMLElement): void {
    const stop = () => { this.stopFollowing(); this.onStopFollowing(); };
    const stopForMapKey = (event: KeyboardEvent) => {
      if (!isMapInteractionKey(event.key)) return;
      stop();
    };
    element.addEventListener("pointerdown", stop);
    element.addEventListener("wheel", stop, { passive: true });
    element.addEventListener("keydown", stopForMapKey);
    this.cleanupInput = () => {
      element.removeEventListener("pointerdown", stop);
      element.removeEventListener("wheel", stop);
      element.removeEventListener("keydown", stopForMapKey);
    };
  }

  setRoute(nodes: RouteNode[]): void {
    this.nodes = routeNodesToContractRoute(nodes).timedNodes;
    this.drawRoute();
    this.drawActiveLeg();
    if (!this.position) this.fitToRoute();
  }

  setSantaPosition(position: SantaPosition): void {
    const previousIndex = this.position?.journey.currentIndex;
    this.position = position;
    if (previousIndex !== position.journey.currentIndex) this.drawRoute();
    this.drawActiveLeg();
    this.drawMarker();
    if (this.following) this.centerSanta();
  }

  private drawRoute(): void {
    this.route.clear();
    this.drawStops();
    this.nodes.slice(1).forEach((node, index) => {
      if (index === this.position?.journey.currentIndex) return;
      const previous = this.nodes[index];
      if (!previous) return;
      drawLeg(this.route, previous.location, node.location, index < (this.position?.journey.currentIndex ?? -1) ? this.styles.flown : this.styles.ahead);
    });
  }

  private drawStops(): void {
    this.stops.clear();
    const reached = this.position?.journey.currentIndex ?? -1;
    this.nodes.forEach((node, index) => {
      if (node.type !== "DELIVERY") return;
      const dot = new Feature(new Point(fromLonLat(positionToView(node.location))));
      dot.setStyle(index <= reached ? this.styles.stopDone : this.styles.stopAhead);
      this.stops.addFeature(dot);
    });
  }

  private drawActiveLeg(): void {
    this.activeLeg.clear();
    const index = this.position?.journey.currentIndex;
    if (index == null || !this.position) return;
    const from = this.nodes[index];
    const next = this.nodes[index + 1];
    if (!from || !next) return;
    drawLeg(this.activeLeg, from.location, this.position, this.styles.flown);
    drawLeg(this.activeLeg, this.position, next.location, this.styles.ahead);
  }

  private drawMarker(): void {
    this.marker.clear();
    if (!this.position) return;
    const index = this.position.journey.currentIndex;
    const next = index == null ? undefined : this.nodes[index + 1];
    const west = next ? headingWest(bearingBetween(this.position, next.location)) : false;
    const marker = new Feature(new Point(fromLonLat(positionToView(this.position))));
    marker.setStyle(this.styles.marker(west));
    this.marker.addFeature(marker);
  }

  private centerSanta(): void {
    if (!this.position) return;
    this.map?.getView().setCenter(fromLonLat(positionToView(this.position)));
  }

  /** Flies up to the North Pole station, which sits beyond the northern edge of the projected world. */
  visitPole(): void {
    this.stopFollowing();
    const map = this.map;
    if (!map) return;
    const view = map.getView();
    const zoom = 3.6;
    const [x, y] = POLE_COORD;
    const dropPx = (map.getSize()?.[1] ?? 800) * 0.12;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    view.animate({ center: [x ?? 0, (y ?? 0) + dropPx * view.getResolutionForZoom(zoom)], zoom, duration: reduced ? 0 : 1400 });
  }

  follow(): void { this.following = true; this.centerSanta(); }
  stopFollowing(): void { this.following = false; }
  fitToRoute(): void {
    const extent = this.route.getExtent();
    if (!extent) return;
    if (!hasValidMapExtent(extent)) return;
    this.map?.getView().fit(extent, { padding: [32, 32, 32, 32] });
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.art?.dispose();
    this.cancelStyle?.();
    this.cleanupInput?.();
    this.map?.setTarget();
    this.map?.dispose();
    this.map = undefined;
    this.art = undefined;
    this.cleanupInput = undefined;
    this.cancelStyle = undefined;
  }
}
