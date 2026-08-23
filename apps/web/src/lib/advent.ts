import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getAdventCalendarPath } from "./config";

export interface AdventDay {
  day: number;
  title: string;
  unlock_time: string;
  content_type: "fact" | "game" | "story" | "video" | "activity" | "quiz";
  payload: Record<string, any>;
  is_unlocked_override?: boolean | null;
  isCurrentlyUnlocked?: boolean;
}

// simple in-memory cache with mtime validation
const cache = new Map<string, { mtimeMs: number; size: number; ino: number; data: AdventDay[] }>();
const CONTENT_TYPES = ["fact", "game", "story", "video", "activity", "quiz"] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function validateUnlockTime(value: string): void {
  const dt = new Date(value.replace("Z", "+00:00"));
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid date");
}

function parseAdventDay(day: any): AdventDay {
  validateRequiredFields(day);
  validateDayNumber(day.day);
  validateContentType(day.content_type);
  validateDayUnlockTime(day.unlock_time);
  return {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    payload: day.payload,
    is_unlocked_override: day.is_unlocked_override ?? null,
  };
}

function validateRequiredFields(day: any): void {
  const required = ["day", "title", "unlock_time", "content_type", "payload"];
  if (required.some(field => day[field] == null)) {
    throw new Error(`Missing required field in advent day data: ${JSON.stringify(day)}`);
  }
}

function validateDayNumber(day: number): void {
  if (day < 1 || day > 24) throw new Error(`Day must be between 1 and 24, got ${day}`);
}

function validateContentType(contentType: string): void {
  if (!CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number])) {
    throw new Error(`Content type must be one of ${CONTENT_TYPES}`);
  }
}

function validateDayUnlockTime(value: string): void {
  try {
    validateUnlockTime(value);
  } catch (e: any) {
    throw new Error(`Invalid unlock_time format: ${e.message}`);
  }
}

export async function loadAdventCalendar(filePath?: string): Promise<AdventDay[]> {
  const p = path.resolve(filePath ?? getAdventCalendarPath());
  if (!fsSync.existsSync(p)) throw new Error(`Advent calendar file not found: ${p}`);
  const stat = fsSync.statSync(p);
  const cached = cache.get(p);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && cached.ino === stat.ino) {
    return clone(cached.data);
  }
  const content = await fs.readFile(p, "utf-8");
  if (!content.trim()) throw new Error(`Advent calendar file is empty: ${p}`);
  let data: { days?: any[] };
  try {
    data = JSON.parse(content);
  } catch (e: any) {
    throw new Error(`JSON decode error in ${p}: ${e.message}`);
  }
  const days = (data.days ?? []).map(parseAdventDay);
  cache.set(p, { mtimeMs: stat.mtimeMs, size: stat.size, ino: stat.ino, data: days });
  return clone(days);
}

export async function loadAdventCalendarDict(filePath?: string): Promise<Map<number, AdventDay>> {
  const days = await loadAdventCalendar(filePath);
  const m = new Map<number, AdventDay>();
  for (const d of days) m.set(d.day, d);
  return m;
}

export function isUnlocked(day: AdventDay, currentTime: Date = new Date()): boolean {
  if (day.is_unlocked_override != null) return day.is_unlocked_override;
  const unlock = new Date(day.unlock_time.replace("Z", "+00:00"));
  return currentTime.getTime() >= unlock.getTime();
}

export function toDict(day: AdventDay, opts: { includePayload?: boolean; currentTime?: Date } = {}) {
  const unlocked = isUnlocked(day, opts.currentTime);
  const result: any = {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    is_unlocked: unlocked,
  };
  if (opts.includePayload !== false && unlocked) result.payload = day.payload;
  return result;
}

export async function getManifest(currentTime: Date = new Date(), filePath?: string) {
  const days = await loadAdventCalendar(filePath);
  const daysData = days.map(d => toDict(d, { includePayload: false, currentTime }));
  return { total_days: days.length, days: daysData };
}

export async function getDayContent(dayNumber: number, currentTime: Date = new Date(), filePath?: string) {
  if (dayNumber < 1 || dayNumber > 24) return null;
  const dict = await loadAdventCalendarDict(filePath);
  const day = dict.get(dayNumber);
  if (!day) return null;
  return toDict(day, { includePayload: true, currentTime });
}

export async function saveAdventCalendar(days: AdventDay[] | Map<number, AdventDay>, filePath?: string) {
  const p = path.resolve(filePath ?? getAdventCalendarPath());
  const list = days instanceof Map ? Array.from(days.values()) : days;
  const data = {
    days: list.map(d => {
      const o: any = {
        day: d.day,
        title: d.title,
        unlock_time: d.unlock_time,
        content_type: d.content_type,
        payload: d.payload,
      };
      if (d.is_unlocked_override != null) o.is_unlocked_override = d.is_unlocked_override;
      return o;
    }),
  };
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, p);
  cache.delete(p);
  // versioned history
  try {
    const dir = path.join(path.dirname(p), ".history");
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(dir, `advent-${stamp}.json`), JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export function validateAdventCalendar(days: AdventDay[]) {
  const errors = duplicateDayErrors(days);
  const warnings = missingDayWarnings(days);
  const required: Record<string, string> = { fact: "text", story: "text", game: "url", video: "video_url", activity: "url", quiz: "url" };
  for (const day of days) warnings.push(...validateDayPayload(day, required));
  return { valid: errors.length === 0, errors, warnings, total_days: days.length, complete_days: days.filter(d => d.payload).length };
}

function duplicateDayErrors(days: AdventDay[]): string[] {
  const nums = days.map(d => d.day);
  const dups = nums.filter((d, i) => nums.indexOf(d) !== i);
  return dups.length > 0 ? [`Duplicate day numbers found: ${[...new Set(dups)]}`] : [];
}

function missingDayWarnings(days: AdventDay[]): string[] {
  const nums = days.map(d => d.day);
  const expected = new Set(Array.from({ length: 24 }, (_, i) => i + 1));
  const actual = new Set(nums);
  const missing = [...expected].filter(d => !actual.has(d));
  return missing.length > 0 ? [`Missing days: ${missing.sort((a, b) => a - b)}`] : [];
}

function validateDayPayload(day: AdventDay, required: Record<string, string>): string[] {
  const warnings: string[] = [];
  const field = required[day.content_type];
  if (field && !day.payload?.[field]) warnings.push(`Day ${day.day}: Missing '${field}' in payload`);
  const image = day.payload?.image_url;
  if (image && !isValidImageUrl(image)) warnings.push(`Day ${day.day}: Unusual image_url format: ${image}`);
  return warnings;
}

function isValidImageUrl(image: string): boolean {
  return image.startsWith("/static/") || image.startsWith("http") || image.startsWith("/");
}
