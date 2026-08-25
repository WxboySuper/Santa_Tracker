import {
  isUnlocked,
  isValidContentType,
  isValidUnlockTime,
  loadAdventCalendar,
  loadAdventCalendarDict,
  parseDayNumber,
  saveAdventCalendar,
  validateAdventCalendar,
  type AdventDay,
} from "./advent";
import { badRequest, isRecord, notFoundAwareError, type AdminApiResult } from "./admin-api";

const NOT_FOUND_BODY = { error: "Advent calendar data not found" };
const INVALID_DATA_MESSAGE = "Invalid data provided";

function dayNotFound(): AdminApiResult {
  return { status: 404, body: { error: "Day not found" } };
}

function invalidDayNumber(): AdminApiResult {
  return badRequest("Day number must be between 1 and 24");
}

export async function getAdminAdventDay(rawDay: string): Promise<AdminApiResult> {
  const dayNumber = parseDayNumber(rawDay);
  if (dayNumber === null) return invalidDayNumber();
  try {
    return await loadAdminAdventDay(dayNumber);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function loadAdminAdventDay(dayNumber: number): Promise<AdminApiResult> {
  const dict = await loadAdventCalendarDict();
  const day = dict.get(dayNumber);
  if (!day) return dayNotFound();
  return { status: 200, body: adminDayDetail(day) };
}

function adminDayDetail(day: AdventDay): Record<string, unknown> {
  return {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    payload: day.payload,
    is_unlocked_override: day.is_unlocked_override ?? null,
    is_currently_unlocked: isUnlocked(day),
  };
}

export async function updateAdminAdventDay(rawDay: string, payload: unknown): Promise<AdminApiResult> {
  const dayNumber = parseDayNumber(rawDay);
  if (dayNumber === null) return invalidDayNumber();
  try {
    return await applyAdventDayUpdate(dayNumber, payload);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function applyAdventDayUpdate(dayNumber: number, payload: unknown): Promise<AdminApiResult> {
  if (!isRecord(payload)) return badRequest("No data provided");
  const dict = await loadAdventCalendarDict();
  const existing = dict.get(dayNumber);
  if (!existing) return dayNotFound();

  const contentType = payload.content_type ?? existing.content_type;
  if (typeof contentType !== "string" || !isValidContentType(contentType)) {
    return badRequest(INVALID_DATA_MESSAGE);
  }
  const unlockTime = payload.unlock_time ?? existing.unlock_time;
  if (typeof unlockTime !== "string" || !isValidUnlockTime(unlockTime)) {
    return badRequest(INVALID_DATA_MESSAGE);
  }

  dict.set(dayNumber, mergedAdventDay(dayNumber, existing, payload, contentType, unlockTime));
  await saveAdventCalendar(dict);
  return { status: 200, body: { message: "Day updated successfully" } };
}

function mergedAdventDay(
  dayNumber: number,
  existing: AdventDay,
  payload: Record<string, unknown>,
  contentType: string,
  unlockTime: string,
): AdventDay {
  return {
    day: dayNumber,
    title: orFallback(payload.title, existing.title),
    unlock_time: unlockTime,
    content_type: contentType as AdventDay["content_type"],
    payload: orFallback(payload.payload, existing.payload),
    is_unlocked_override: (payload.is_unlocked_override ?? existing.is_unlocked_override ?? null) as boolean | null,
  };
}

function orFallback<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
}

export async function toggleAdminAdventUnlock(rawDay: string): Promise<AdminApiResult> {
  const dayNumber = parseDayNumber(rawDay);
  if (dayNumber === null) return invalidDayNumber();
  try {
    return await toggleAdventOverride(dayNumber);
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

async function toggleAdventOverride(dayNumber: number): Promise<AdminApiResult> {
  const dict = await loadAdventCalendarDict();
  const day = dict.get(dayNumber);
  if (!day) return dayNotFound();

  const next = nextUnlockOverride(day.is_unlocked_override);
  day.is_unlocked_override = next;
  dict.set(dayNumber, day);
  await saveAdventCalendar(dict);
  return { status: 200, body: { message: "Unlock status toggled", is_unlocked_override: next } };
}

// Toggle cycle: true -> false -> null -> true
function nextUnlockOverride(current: boolean | null | undefined): boolean | null {
  if (current === true) return false;
  if (current === false) return null;
  return true;
}

export async function listAdminAdventDays(): Promise<AdminApiResult> {
  try {
    const days = await loadAdventCalendar();
    return { status: 200, body: { days: days.map(adminDaySummary), total_days: days.length } };
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

function adminDaySummary(day: AdventDay): Record<string, unknown> {
  return {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    payload: day.payload,
    is_unlocked_override: day.is_unlocked_override ?? null,
    is_currently_unlocked: isUnlocked(day),
  };
}

export async function exportAdminAdventDays(): Promise<AdminApiResult> {
  try {
    const days = await loadAdventCalendar();
    return { status: 200, body: { days: days.map(exportableDay), total_days: days.length } };
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

function exportableDay(day: AdventDay): Record<string, unknown> {
  return {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    payload: day.payload,
    is_unlocked_override: day.is_unlocked_override ?? undefined,
  };
}

export async function validateAdminAdventDays(): Promise<AdminApiResult> {
  try {
    const days = await loadAdventCalendar();
    return { status: 200, body: validateAdventCalendar(days) };
  } catch (error) {
    return notFoundAwareError(error, NOT_FOUND_BODY);
  }
}

type ImportParse =
  | { kind: "invalid_request" }
  | { kind: "invalid_day" }
  | { kind: "days"; days: AdventDay[] };

const REQUIRED_DAY_FIELDS = ["day", "title", "unlock_time", "content_type", "payload"];

export async function importAdminAdventDays(payload: unknown): Promise<AdminApiResult> {
  try {
    return await storeImportedDays(parseImportRequest(payload));
  } catch (error) {
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

function parseImportRequest(payload: unknown): ImportParse {
  if (!isRecord(payload) || !Array.isArray(payload.days)) return { kind: "invalid_request" };
  const days: AdventDay[] = [];
  for (const raw of payload.days) {
    const day = normalizeImportedDay(raw);
    if (!day) return { kind: "invalid_day" };
    days.push(day);
  }
  return { kind: "days", days };
}

function normalizeImportedDay(raw: unknown): AdventDay | null {
  if (!isRecord(raw)) return null;
  if (REQUIRED_DAY_FIELDS.some(field => !raw[field])) return null;
  return {
    day: raw.day as number,
    title: raw.title as string,
    unlock_time: raw.unlock_time as string,
    content_type: raw.content_type as AdventDay["content_type"],
    payload: raw.payload as AdventDay["payload"],
    is_unlocked_override: (raw.is_unlocked_override ?? null) as boolean | null,
  };
}

async function storeImportedDays(parsed: ImportParse): Promise<AdminApiResult> {
  if (parsed.kind === "invalid_request") return badRequest("Invalid import data");
  if (parsed.kind === "invalid_day") return badRequest("Invalid day data");

  const validation = validateAdventCalendar(parsed.days);
  if (!validation.valid) {
    return { status: 400, body: { error: "Validation failed", errors: validation.errors } };
  }
  await saveAdventCalendar(parsed.days);
  return {
    status: 200,
    body: {
      message: `Imported ${parsed.days.length} days`,
      total_days: parsed.days.length,
      warnings: validation.warnings,
    },
  };
}
