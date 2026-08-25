import fs from "node:fs";
import path from "node:path";

export function getSecretKey(): string {
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
  // The legacy data file remains the source of truth until the Flask archive is
  // retired. Next.js reads it server-side; public consumers use /api/route.
  return path.join(process.cwd(), "..", "..", "src", "static", "data", "santa_route.json");
}

export function getAdventCalendarPath(): string {
  if (process.env.ADVENT_CALENDAR_PATH) return process.env.ADVENT_CALENDAR_PATH;
  return path.join(process.cwd(), "..", "..", "src", "static", "data", "advent_calendar.json");
}

export function getTrialRoutePath(): string {
  const legacy = path.join(process.cwd(), "..", "..", "src", "static", "data", "trial_route.json");
  const appData = path.join(process.cwd(), "data", "trial_route.json");
  try {
    if (fs.existsSync(legacy)) return legacy;
    if (fs.existsSync(appData)) return appData;
  } catch {}
  return appData;
}
