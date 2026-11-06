export type TrackerViewMode = "standard" | "immersive" | "tv";

export function trackerViewMode(value: string | null): TrackerViewMode {
  return value === "immersive" || value === "tv" ? value : "standard";
}
