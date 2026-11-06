import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerName } from "./types";

type CalendarDay = { day: number; is_unlocked_override?: boolean };
type Calendar = { days: CalendarDay[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return false;
  return true;
}

function isValidDayNumber(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  if (value < 1) return false;
  return value <= 24;
}

function hasValidOverride(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === "boolean";
}

function isCalendarDay(value: unknown): value is CalendarDay {
  if (!isRecord(value)) return false;
  if (!isValidDayNumber(value.day)) return false;
  return hasValidOverride(value.is_unlocked_override);
}

function isCalendar(value: unknown): value is Calendar {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return false;
  const days = (value as { days?: unknown }).days;
  if (!Array.isArray(days)) return false;
  if (days.length !== 24) return false;
  if (!days.every(isCalendarDay)) return false;
  return new Set(days.map((day) => day.day)).size === 24;
}

function parseCalendar(source: string, filePath: string): Calendar {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse Advent calendar at ${filePath}: ${reason}`, { cause: error });
  }
  if (!isCalendar(value)) throw new Error(`Advent calendar at ${filePath} must contain 24 unique days numbered 1-24`);
  return value;
}

async function writeServerData(name: ServerName, root: string, route: string, originalCalendar: Calendar): Promise<string> {
  const dataRoot = path.join(root, name);
  await mkdir(dataRoot, { recursive: true });
  const calendar = JSON.parse(JSON.stringify(originalCalendar)) as Calendar;
  for (const day of calendar.days) delete day.is_unlocked_override;
  if (name === "open") {
    const firstDay = calendar.days.find((day) => day.day === 1);
    if (!firstDay) throw new Error("The advent calendar must include day 1");
    firstDay.is_unlocked_override = true;
  }
  await Promise.all([
    writeFile(path.join(dataRoot, "santa_route.json"), route),
    writeFile(path.join(dataRoot, "advent_calendar.json"), JSON.stringify(calendar, null, 2)),
  ]);
  return dataRoot;
}

export async function prepareFixtureData(source: string, temporaryRoot: string): Promise<Record<ServerName, string>> {
  const [route, rawCalendar] = await Promise.all([
    readFile(path.join(source, "santa_route.json"), "utf8"),
    readFile(path.join(source, "advent_calendar.json"), "utf8"),
  ]);
  const calendar = parseCalendar(rawCalendar, path.join(source, "advent_calendar.json"));
  const [closed, open] = await Promise.all([
    writeServerData("closed", temporaryRoot, route, calendar),
    writeServerData("open", temporaryRoot, route, calendar),
  ]);
  return { closed, open };
}
