import { seasonSchedule, type SeasonSchedule } from "./season";

export const SEASON_MODES = ["off-season", "preparation", "advent", "flight", "post-season"] as const;
export type SeasonMode = typeof SEASON_MODES[number];

export interface SeasonModeConfig {
  scheduleForYear(year: number): Pick<SeasonSchedule, "preparationStartsAt" | "adventStartsAt" | "flightStartsAt" | "postSeasonStartsAt" | "seasonEndsAt">;
}

export const DEFAULT_SEASON_MODE_CONFIG: SeasonModeConfig = { scheduleForYear: seasonSchedule };

type ModeBoundary = keyof Pick<SeasonSchedule, "preparationStartsAt" | "adventStartsAt" | "flightStartsAt" | "postSeasonStartsAt" | "seasonEndsAt">;
const MODE_WINDOWS = [
  { mode: "preparation", start: "preparationStartsAt", end: "adventStartsAt" },
  { mode: "advent", start: "adventStartsAt", end: "flightStartsAt" },
  { mode: "flight", start: "flightStartsAt", end: "postSeasonStartsAt" },
  { mode: "post-season", start: "postSeasonStartsAt", end: "seasonEndsAt" },
] as const satisfies readonly { mode: SeasonMode; start: ModeBoundary; end: ModeBoundary }[];

function modeWithinSchedule(timestamp: number, schedule: ReturnType<SeasonModeConfig["scheduleForYear"]>): SeasonMode | null {
  return MODE_WINDOWS.find(window => timestamp >= schedule[window.start] && timestamp < schedule[window.end])?.mode ?? null;
}

/** Derives the annual product mode from shared UTC season boundaries. */
export function seasonMode(now: Date, config: SeasonModeConfig = DEFAULT_SEASON_MODE_CONFIG): SeasonMode {
  const timestamp = now.getTime();
  const year = now.getUTCFullYear();
  return modeWithinSchedule(timestamp, config.scheduleForYear(year - 1))
    ?? modeWithinSchedule(timestamp, config.scheduleForYear(year))
    ?? "off-season";
}

export interface SeasonModeOverride {
  mode: SeasonMode;
  setAt: string;
  expiresAt: string;
  reason: string;
  setBy: string;
}

export type SeasonOverrideStatus = "none" | "active" | "expired";
export interface EffectiveSeasonMode {
  mode: SeasonMode;
  overrideStatus: SeasonOverrideStatus;
}

/** Applies a valid override through its expiry instant; an expired one is reported and ignored. */
export function effectiveSeasonMode(now: Date, derived: SeasonMode, override: SeasonModeOverride | null): EffectiveSeasonMode {
  if (!override) return { mode: derived, overrideStatus: "none" };
  if (Date.parse(override.expiresAt) <= now.getTime()) return { mode: derived, overrideStatus: "expired" };
  return { mode: override.mode, overrideStatus: "active" };
}
