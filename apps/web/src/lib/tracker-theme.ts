/**
 * Tracker themes. A theme sets the basemap palette, the trail and stop styling, how Santa is drawn, and which
 * journey card the page shows. The map adapter reads the active theme when it mounts; the page remounts the
 * tracker when the theme changes.
 */
export const TRACKER_THEME_IDS = ["arcade", "radar", "lino", "poster", "knit"] as const;
export type TrackerThemeId = (typeof TRACKER_THEME_IDS)[number];

export interface MapPalette {
  land: string;
  water: string;
  green: string;
  greenOpacity: number;
  ice: string;
  sand: string;
  river: string;
  border: string;
  borderOpacity: number;
  label: string;
  labelSoft: string;
  waterLabel: string;
  halo: string;
  /** Opacity of the shaded-relief raster at world zoom (0 hides it). */
  relief: number;
  /** Country and city labels; off for themes that read better as pure shapes. */
  labels: boolean;
}

export interface TrailPalette {
  flown: string;
  flownWidth: number;
  casing: string;
  casingWidth: number;
  ahead: string;
  aheadWidth: number;
  aheadDash: number[];
  stopDone: string;
  stopDoneStroke: string;
  stopAhead: string;
  stopAheadStroke: string;
  stopRadius: number;
}

export type MarkerKind = "badge" | "radar" | "block" | "disc" | "pixel";

export interface MarkerPalette {
  kind: MarkerKind;
  /** Background shape behind the sleigh (badge, block, disc). */
  fill: string;
  stroke: string;
  /** Sleigh body, runner and reindeer colours. */
  body: string;
  runner: string;
  deer: string;
}

export interface TrackerTheme {
  id: TrackerThemeId;
  name: string;
  /** Google Fonts families to load for this theme. */
  fonts: string[];
  map: MapPalette;
  trail: TrailPalette;
  marker: MarkerPalette;
}

const THEMES: Record<TrackerThemeId, TrackerTheme> = {
  arcade: {
    id: "arcade",
    name: "Arcade",
    fonts: ["Fredoka:wght@500;600;700"],
    map: { land: "#fff1cc", water: "#3ec1d3", green: "#c9ec9a", greenOpacity: 0.55, ice: "#ffffff", sand: "#ffe0a3", river: "#6fd6e3", border: "#2b2240", borderOpacity: 0.55, label: "#2b2240", labelSoft: "#4a3f66", waterLabel: "#14606b", halo: "#fff7e0", relief: 0, labels: true },
    trail: { flown: "#ff4d6d", flownWidth: 5, casing: "#2b2240", casingWidth: 9, ahead: "#ffffff", aheadWidth: 3.5, aheadDash: [1, 9], stopDone: "#ffd23f", stopDoneStroke: "#2b2240", stopAhead: "#ffffff", stopAheadStroke: "#2b2240", stopRadius: 3.4 },
    marker: { kind: "badge", fill: "#ffd23f", stroke: "#2b2240", body: "#e11d48", runner: "#2b2240", deer: "#2b2240" },
  },
  radar: {
    id: "radar",
    name: "Night radar",
    fonts: ["Space+Grotesk:wght@500;600", "JetBrains+Mono:wght@500;600"],
    map: { land: "#0f1c2e", water: "#060b14", green: "#0f1c2e", greenOpacity: 0, ice: "#13253a", sand: "#0f1c2e", river: "#13253a", border: "#2a4a6e", borderOpacity: 0.9, label: "#6f8fb0", labelSoft: "#4d6f93", waterLabel: "#2e4d6d", halo: "#060b14", relief: 0, labels: true },
    trail: { flown: "#ffb020", flownWidth: 2.2, casing: "rgba(255, 176, 32, 0.25)", casingWidth: 8, ahead: "#3a7ca5", aheadWidth: 1.4, aheadDash: [3, 5], stopDone: "#ffb020", stopDoneStroke: "#060b14", stopAhead: "#060b14", stopAheadStroke: "#3a7ca5", stopRadius: 2.8 },
    marker: { kind: "radar", fill: "#ffb020", stroke: "#ffffff", body: "#ffb020", runner: "#ffb020", deer: "#ffb020" },
  },
  lino: {
    id: "lino",
    name: "Linocut print",
    fonts: ["Oswald:wght@400;700"],
    map: { land: "#e4dccd", water: "#f3ede2", green: "#e4dccd", greenOpacity: 0, ice: "#f3ede2", sand: "#e4dccd", river: "#c9bfae", border: "#141414", borderOpacity: 0.85, label: "#141414", labelSoft: "#141414", waterLabel: "#5c564c", halo: "#f3ede2", relief: 0, labels: true },
    trail: { flown: "#d7263d", flownWidth: 4, casing: "#f3ede2", casingWidth: 8, ahead: "#141414", aheadWidth: 2, aheadDash: [6, 5], stopDone: "#d7263d", stopDoneStroke: "#141414", stopAhead: "#f3ede2", stopAheadStroke: "#141414", stopRadius: 3.4 },
    marker: { kind: "block", fill: "#f3ede2", stroke: "#141414", body: "#d7263d", runner: "#141414", deer: "#141414" },
  },
  poster: {
    id: "poster",
    name: "Travel poster",
    fonts: ["Josefin+Sans:wght@400;600;700"],
    map: { land: "#f2c078", water: "#1d3557", green: "#e6b066", greenOpacity: 0.6, ice: "#f4ead5", sand: "#f5cf8e", river: "#2d4a73", border: "#c98f45", borderOpacity: 0.8, label: "#1d3557", labelSoft: "#3d5a80", waterLabel: "#9fb3cc", halo: "#f2c078", relief: 0, labels: true },
    trail: { flown: "#e76f51", flownWidth: 3.5, casing: "#1d3557", casingWidth: 7, ahead: "#f4ead5", aheadWidth: 2, aheadDash: [2, 7], stopDone: "#e76f51", stopDoneStroke: "#f4ead5", stopAhead: "#1d3557", stopAheadStroke: "#f4ead5", stopRadius: 3.2 },
    marker: { kind: "disc", fill: "#f4ead5", stroke: "#1d3557", body: "#e76f51", runner: "#1d3557", deer: "#1d3557" },
  },
  knit: {
    id: "knit",
    name: "Christmas jumper",
    fonts: ["Silkscreen"],
    map: { land: "#f7ecd8", water: "#b3202a", green: "#f7ecd8", greenOpacity: 0, ice: "#ffffff", sand: "#f7ecd8", river: "#9c1b24", border: "#d9c3a0", borderOpacity: 0.9, label: "#5a2a1a", labelSoft: "#7a3a28", waterLabel: "#f7ecd8", halo: "#b3202a", relief: 0, labels: false },
    trail: { flown: "#3c9a5f", flownWidth: 4, casing: "#2d1414", casingWidth: 7, ahead: "#f7ecd8", aheadWidth: 3, aheadDash: [4, 4], stopDone: "#3c9a5f", stopDoneStroke: "#2d1414", stopAhead: "#f7ecd8", stopAheadStroke: "#2d1414", stopRadius: 3.2 },
    marker: { kind: "pixel", fill: "#f7ecd8", stroke: "#2d1414", body: "#b3202a", runner: "#d4a017", deer: "#7a4b2a" },
  },
};

export const DEFAULT_TRACKER_THEME: TrackerThemeId = "arcade";

export function isTrackerThemeId(value: unknown): value is TrackerThemeId {
  return typeof value === "string" && (TRACKER_THEME_IDS as readonly string[]).includes(value);
}

export function trackerTheme(id: TrackerThemeId): TrackerTheme {
  return THEMES[id];
}

let active: TrackerThemeId = DEFAULT_TRACKER_THEME;

/** The theme the map adapter draws with; set by the page before the tracker mounts. */
export function activeTrackerTheme(): TrackerTheme {
  return THEMES[active];
}

export function setActiveTrackerTheme(id: TrackerThemeId): void {
  active = id;
}

export function themeFontsHref(theme: TrackerTheme): string {
  return `https://fonts.googleapis.com/css2?${theme.fonts.map(family => `family=${family}`).join("&")}&display=swap`;
}
