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
  // Prefer new app data location, fallback to legacy Flask location
  // In dev, workspace root is 3 levels up from apps/web
  const path = require("path");
  const legacy = path.join(process.cwd(), "..", "..", "src", "static", "data", "santa_route.json");
  const appData = path.join(process.cwd(), "data", "santa_route.json");
  // If legacy exists, use it for parity
  try {
    const fs = require("fs");
    if (fs.existsSync(legacy)) return legacy;
    if (fs.existsSync(appData)) return appData;
  } catch {}
  return legacy;
}

export function getAdventCalendarPath(): string {
  if (process.env.ADVENT_CALENDAR_PATH) return process.env.ADVENT_CALENDAR_PATH;
  const path = require("path");
  const legacy = path.join(process.cwd(), "..", "..", "src", "static", "data", "advent_calendar.json");
  const appData = path.join(process.cwd(), "data", "advent_calendar.json");
  try {
    const fs = require("fs");
    if (fs.existsSync(legacy)) return legacy;
    if (fs.existsSync(appData)) return appData;
  } catch {}
  return legacy;
}

export function getTrialRoutePath(): string {
  const path = require("path");
  const legacy = path.join(process.cwd(), "..", "..", "src", "static", "data", "trial_route.json");
  const appData = path.join(process.cwd(), "data", "trial_route.json");
  try {
    const fs = require("fs");
    if (fs.existsSync(legacy)) return legacy;
    if (fs.existsSync(appData)) return appData;
  } catch {}
  return appData;
}
