import { existsSync } from "node:fs";
import path from "node:path";

export function getDataRoot(): string {
  if (process.env.SANTA_DATA_ROOT) return process.env.SANTA_DATA_ROOT;
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "apps", "web", "data"),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}

export function getSecretKey(): string {
  // dev fallback only; production must set SECRET_KEY env
  return process.env.SECRET_KEY ?? "dev-secret-key";
}

export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

export function isAdventEnabled(): boolean {
  return process.env.ADVENT_ENABLED === "True" || process.env.ADVENT_ENABLED === "true";
}

export function getSantaRoutePath(): string {
  if (process.env.SANTA_ROUTE_PATH) return process.env.SANTA_ROUTE_PATH;
  return getDataPath("santa_route.json");
}

export function getAdventCalendarPath(): string {
  if (process.env.ADVENT_CALENDAR_PATH) return process.env.ADVENT_CALENDAR_PATH;
  return getDataPath("advent_calendar.json");
}

function getDataPath(filename: string): string {
  return path.join(getDataRoot(), filename);
}

export async function getTrialRoutePath(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "data", "trial_route.json"),
    path.join(process.cwd(), "apps", "web", "data", "trial_route.json"),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}
