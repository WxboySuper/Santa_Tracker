import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
  const candidates = [
    path.join(process.cwd(), "data", filename),
    path.join(process.cwd(), "apps", "web", "data", filename),
    path.join(process.cwd(), "..", "..", "src", "static", "data", filename),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}

export async function getTrialRoutePath(): Promise<string> {
  const legacy = path.join(process.cwd(), "..", "..", "src", "static", "data", "trial_route.json");
  const appData = path.join(process.cwd(), "data", "trial_route.json");
  try {
    await fs.access(legacy);
    return legacy;
  } catch {}
  return appData;
}
