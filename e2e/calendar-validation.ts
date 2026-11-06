import path from "node:path";
import { isRecord } from "./validation";

export type CalendarDay = { day: number; is_unlocked_override?: boolean };
export type Calendar = { days: CalendarDay[] };

type CalendarSource = { content: string; path: string };

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
  if (!isRecord(value)) return false;
  const days = value.days;
  if (!Array.isArray(days)) return false;
  if (days.length !== 24) return false;
  if (!days.every(isCalendarDay)) return false;
  return new Set(days.map((day) => day.day)).size === 24;
}

export function parseCalendar({ content, path: filePath }: CalendarSource): Calendar {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse Advent calendar at ${filePath}: ${reason}`, { cause: error });
  }
  if (!isCalendar(value)) throw new Error(`Advent calendar at ${filePath} must contain 24 unique days numbered 1-24`);
  return value;
}

export function cloneCalendar(calendar: Calendar): Calendar {
  return JSON.parse(JSON.stringify(calendar)) as Calendar;
}

export function closeCalendar(calendar: Calendar): Calendar {
  const closed = cloneCalendar(calendar);
  for (const day of closed.days) delete day.is_unlocked_override;
  return closed;
}

export function openFirstDay(calendar: Calendar): Calendar {
  const open = cloneCalendar(calendar);
  for (const day of open.days) day.is_unlocked_override = false;
  // parseCalendar guarantees this day exists.
  open.days.find((day) => day.day === 1)!.is_unlocked_override = true;
  return open;
}

export function getCalendarPath(source: string): string {
  return path.join(source, "advent_calendar.json");
}
