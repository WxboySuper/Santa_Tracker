/** Tracker layouts: how the screen is arranged, independent of the colour theme. */
export const TRACKER_LAYOUT_IDS = ["globe", "feed", "flight", "timeline", "card"] as const;
export type TrackerLayoutId = (typeof TRACKER_LAYOUT_IDS)[number];

export const TRACKER_LAYOUT_NAMES: Record<TrackerLayoutId, string> = {
  globe: "Globe",
  feed: "Map + live feed",
  flight: "Flight tracker",
  timeline: "Night timeline",
  card: "Single card",
};

export const DEFAULT_TRACKER_LAYOUT: TrackerLayoutId = "globe";

export function isTrackerLayoutId(value: unknown): value is TrackerLayoutId {
  return typeof value === "string" && (TRACKER_LAYOUT_IDS as readonly string[]).includes(value);
}
