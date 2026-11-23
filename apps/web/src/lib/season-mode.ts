import { seasonSchedule, type SeasonSchedule } from "./season";

export const SEASON_MODES = ["off-season", "preparation", "advent", "flight", "post-season"] as const;
export type SeasonMode = typeof SEASON_MODES[number];

export interface SeasonModeConfig {
  scheduleForYear(year: number): Pick<SeasonSchedule, "preparationStartsAt" | "adventStartsAt" | "flightStartsAt" | "postSeasonStartsAt" | "seasonEndsAt">;
}

export const DEFAULT_SEASON_MODE_CONFIG: SeasonModeConfig = { scheduleForYear: seasonSchedule };

/** Derives the annual product mode from shared UTC season boundaries. */
export function seasonMode(now: Date, config: SeasonModeConfig = DEFAULT_SEASON_MODE_CONFIG): SeasonMode {
  const timestamp = now.getTime();
  const year = now.getUTCFullYear();
  for (const scheduleYear of [year - 1, year]) {
    const schedule = config.scheduleForYear(scheduleYear);
    if (timestamp >= schedule.preparationStartsAt && timestamp < schedule.adventStartsAt) return "preparation";
    if (timestamp >= schedule.adventStartsAt && timestamp < schedule.flightStartsAt) return "advent";
    if (timestamp >= schedule.flightStartsAt && timestamp < schedule.postSeasonStartsAt) return "flight";
    if (timestamp >= schedule.postSeasonStartsAt && timestamp < schedule.seasonEndsAt) return "post-season";
  }
  return "off-season";
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
