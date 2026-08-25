import fs from "fs/promises";
import type { Stats } from "node:fs";
import path from "path";
import { getAdventCalendarPath, isAdventEnabled } from "./config";

export interface AdventDay {
  day: number;
  title: string;
  unlock_time: string;
  content_type: "fact" | "game" | "story" | "video" | "activity" | "quiz";
  payload: Record<string, unknown>;
  is_unlocked_override?: boolean | null;
  isCurrentlyUnlocked?: boolean;
}

export interface AdventPublicDay {
  day: number;
  title: string;
  unlock_time: string;
  content_type: AdventDay["content_type"];
  is_unlocked: boolean;
  payload?: Record<string, unknown>;
}

export interface AdventManifest {
  total_days: number;
  days: AdventPublicDay[];
}

export interface AdventApiResult {
  status: number;
  body: object;
}

interface AdventFileOptions {
  filePath?: string;
}

interface AdventQueryOptions extends AdventFileOptions {
  currentTime?: Date;
}

interface AdventTextValue {
  value: string;
}

// simple in-memory cache with mtime validation
const cache = new Map<string, { mtimeMs: number; size: number; data: AdventDay[] }>();
const CONTENT_TYPES = ["fact", "game", "story", "video", "activity", "quiz"] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function validateUnlockTime({ value }: AdventTextValue): void {
  const dt = new Date(value.replace("Z", "+00:00"));
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid date");
}

function parseAdventDay(day: any): AdventDay {
  validateRequiredFields(day);
  validateDayNumber(day.day);
  validateContentType({ contentType: day.content_type });
  validateDayUnlockTime({ value: day.unlock_time });
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

function validateContentType({ contentType }: { contentType: string }): void {
  if (!CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number])) {
    throw new Error(`Content type must be one of ${CONTENT_TYPES}`);
  }
}

function validateDayUnlockTime(value: AdventTextValue): void {
  try {
    validateUnlockTime(value);
  } catch (e: any) {
    throw new Error(`Invalid unlock_time format: ${e.message}`);
  }
}

export async function loadAdventCalendar(options: AdventFileOptions = {}): Promise<AdventDay[]> {
  const p = path.resolve(options.filePath ?? getAdventCalendarPath());
  let stat: Stats;
  try {
    stat = await fs.stat(p);
  } catch {
    throw new Error(`Advent calendar file not found: ${p}`);
  }
  const cached = cache.get(p);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
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
  cache.set(p, { mtimeMs: stat.mtimeMs, size: stat.size, data: days });
  return clone(days);
}

export async function loadAdventCalendarDict(options: AdventFileOptions = {}): Promise<Map<number, AdventDay>> {
  const days = await loadAdventCalendar(options);
  const m = new Map<number, AdventDay>();
  for (const d of days) m.set(d.day, d);
  return m;
}

export function isUnlocked(day: AdventDay, currentTime: Date = new Date()): boolean {
  if (day.is_unlocked_override != null) return day.is_unlocked_override;
  const unlock = new Date(day.unlock_time.replace("Z", "+00:00"));
  return currentTime.getTime() >= unlock.getTime();
}

export function toDict(day: AdventDay, opts: { includePayload?: boolean; currentTime?: Date } = {}): AdventPublicDay {
  const unlocked = isUnlocked(day, opts.currentTime);
  const result: AdventPublicDay = {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    is_unlocked: unlocked,
  };
  if (opts.includePayload !== false && unlocked) result.payload = day.payload;
  return result;
}

export async function getManifest(options: AdventQueryOptions = {}): Promise<AdventManifest> {
  const days = await loadAdventCalendar(options);
  const daysData = days.map(d => toDict(d, { includePayload: false, currentTime: options.currentTime }));
  return { total_days: days.length, days: daysData };
}

export async function getDayContent(dayNumber: number, options: AdventQueryOptions = {}): Promise<AdventPublicDay | null> {
  if (dayNumber < 1 || dayNumber > 24) return null;
  const dict = await loadAdventCalendarDict(options);
  const day = dict.get(dayNumber);
  if (!day) return null;
  return toDict(day, { includePayload: true, currentTime: options.currentTime });
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("not found");
}

function parseDayNumber(rawDay: string): number | null {
  const dayNumber = Number(rawDay);
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 24 ? dayNumber : null;
}

function dayContentResult(content: AdventPublicDay): AdventApiResult {
  if (!content.is_unlocked) {
    return {
      status: 403,
      body: { error: "Day is locked", day: content.day, title: content.title, unlock_time: content.unlock_time },
    };
  }
  return { status: 200, body: content };
}

async function loadDayApiResult(dayNumber: number): Promise<AdventApiResult> {
  const content = await getDayContent(dayNumber);
  if (!content) return { status: 404, body: { error: "Day not found" } };
  return dayContentResult(content);
}

function invalidDayResult(): AdventApiResult {
  return { status: 404, body: { error: "Day not found" } };
}

async function getValidatedDayApiResult(rawDay: string): Promise<AdventApiResult> {
  const dayNumber = parseDayNumber(rawDay);
  if (dayNumber === null) return invalidDayResult();
  return getDayApiResultWithErrorHandling(dayNumber);
}

async function getDayApiResultWithErrorHandling(dayNumber: number): Promise<AdventApiResult> {
  try {
    return await loadDayApiResult(dayNumber);
  } catch (error: unknown) {
    if (isNotFoundError(error)) return { status: 404, body: { error: "Advent calendar data not found" } };
    console.error("Advent day error", error);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

export async function getDayApiResult(rawDay: string): Promise<AdventApiResult> {
  if (!isAdventEnabled()) return { status: 404, body: { error: "Not found" } };
  return getValidatedDayApiResult(rawDay);
}

export async function saveAdventCalendar(days: AdventDay[] | Map<number, AdventDay>, options: AdventFileOptions = {}) {
  const p = path.resolve(options.filePath ?? getAdventCalendarPath());
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
  if (image && !isValidImageUrl({ image })) warnings.push(`Day ${day.day}: Unusual image_url format: ${image}`);
  return warnings;
}

function isValidImageUrl({ image }: { image: unknown }): boolean {
  if (typeof image !== "string") return false;
  return image.startsWith("/static/") || image.startsWith("http") || image.startsWith("/");
}
