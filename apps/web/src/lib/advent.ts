import fs from "fs/promises";
import path from "path";
import { isAdventEnabled } from "./config";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { getSnapshotStore } from "./storage";
import { ensureStoreBootstrapped, persistAdventCalendar } from "./storage/publish";
import { DATASET_ADVENT } from "./storage/types";

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

export type AdventClock = () => Date;
export type AdventMode = "live" | "archive";

export const trustedClock: AdventClock = () => new Date();

interface AdventFileOptions {
  filePath?: string;
}

interface AdventQueryOptions extends AdventFileOptions {
  currentTime?: Date;
  clock?: AdventClock;
  mode?: AdventMode;
}

interface AdventTextValue {
  value: string;
}

interface CachedAdventCalendar {
  versionKey: string;
  data: AdventDay[];
  byDay: Map<number, AdventDay>;
}

const cache = new Map<string, CachedAdventCalendar>();
const CONTENT_TYPES = ["fact", "game", "story", "video", "activity", "quiz"] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function validateUnlockTime({ value }: AdventTextValue): void {
  const dt = parseUnlockTimeValue(value);
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid date");
}

function parseUnlockTimeValue(value: string): Date {
  return new Date(value.replace("Z", "+00:00"));
}

function isObjectValue(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isObjectValue(value) && !Array.isArray(value);
}

function asRecord(value: unknown, description: string): Record<string, unknown> {
  if (!isRecordValue(value)) throw new Error(`${description} must be an object`);
  return value;
}

function parseAdventDay(value: unknown): AdventDay {
  const day = asRecord(value, "Advent day");
  validateRequiredFields(day);
  const dayNumber = validateDayNumber(day.day);
  const contentType = parseContentType(day.content_type);
  if (typeof day.title !== "string") throw new Error("Advent day title must be a string");
  if (typeof day.unlock_time !== "string") throw new Error("Advent day unlock_time must be a string");
  const payload = asRecord(day.payload, "Advent day payload");
  const unlockOverride = day.is_unlocked_override;
  if (unlockOverride != null && typeof unlockOverride !== "boolean") {
    throw new Error("Advent day is_unlocked_override must be a boolean");
  }
  validateDayUnlockTime({ value: day.unlock_time });
  return {
    day: dayNumber,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: contentType,
    payload,
    is_unlocked_override: unlockOverride ?? null,
  };
}

function validateRequiredFields(day: Record<string, unknown>): void {
  const required = ["day", "title", "unlock_time", "content_type", "payload"];
  if (required.some(field => day[field] == null)) {
    throw new Error(`Missing required field in advent day data: ${JSON.stringify(day)}`);
  }
}

function validateDayNumber(day: unknown): number {
  if (!isValidDayNumber(day)) {
    throw new Error(`Day must be between 1 and 24, got ${String(day)}`);
  }
  return day;
}

function isValidDayNumber(day: unknown): day is number {
  if (typeof day !== "number") return false;
  if (!Number.isInteger(day)) return false;
  if (day < 1) return false;
  return day <= 24;
}

function parseContentType(contentType: unknown): AdventDay["content_type"] {
  if (typeof contentType !== "string" || !isValidContentType(contentType)) {
    throw new Error(`Content type must be one of ${CONTENT_TYPES}`);
  }
  return contentType as AdventDay["content_type"];
}

export function isValidContentType(contentType: string): boolean {
  return CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number]);
}

export function isValidUnlockTime(value: string): boolean {
  try {
    validateUnlockTime({ value });
    return true;
  } catch {
    return false;
  }
}

function validateDayUnlockTime(value: AdventTextValue): void {
  try {
    validateUnlockTime(value);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid unlock_time format: ${message}`);
  }
}

async function readAdventSource(options: AdventFileOptions = {}): Promise<{ cacheKey: string | null; versionKey: string; readContent: () => Promise<string> }> {
  if (options.filePath) {
    const absolutePath = path.resolve(options.filePath);
    return { cacheKey: null, versionKey: "", readContent: () => fs.readFile(absolutePath, "utf-8") };
  }
  const bucket = getSantaSnapshotsBucket();
  const store = getSnapshotStore(bucket);
  if (!bucket) await ensureStoreBootstrapped(store);
  const active = await store.readActiveVersion(DATASET_ADVENT);
  if (!active) throw new Error("Advent calendar data not found");
  return {
    cacheKey: DATASET_ADVENT,
    versionKey: active.versionId,
    readContent: async () => (await store.readVersion(DATASET_ADVENT, active.versionId)) ?? "",
  };
}

async function loadCachedAdventCalendar(options: AdventFileOptions = {}): Promise<CachedAdventCalendar> {
  const { cacheKey, versionKey, readContent } = await readAdventSource(options);
  const cached = cacheKey ? cache.get(cacheKey) : undefined;
  if (cached && cached.versionKey === versionKey) {
    return cached;
  }
  const content = await readContent();
  const sourceName = cacheKey ?? options.filePath ?? "advent calendar";
  if (!content.trim()) throw new Error(`Advent calendar file is empty: ${sourceName}`);
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON decode error in ${sourceName}: ${message}`);
  }
  const calendar = asRecord(data, "Advent calendar");
  const rawDays = calendar.days ?? [];
  if (!Array.isArray(rawDays)) throw new Error("Advent calendar days must be an array");
  const days = (rawDays as unknown[]).map(parseAdventDay);
  const parsed: CachedAdventCalendar = { versionKey, data: days, byDay: new Map(days.map(day => [day.day, day])) };
  if (cacheKey) cache.set(cacheKey, parsed);
  return parsed;
}

export async function loadAdventCalendar(options: AdventFileOptions = {}): Promise<AdventDay[]> {
  return clone((await loadCachedAdventCalendar(options)).data);
}

export async function loadAdventCalendarDict(options: AdventFileOptions = {}): Promise<Map<number, AdventDay>> {
  const days = await loadAdventCalendar(options);
  const daysByNumber = new Map<number, AdventDay>();
  for (const day of days) daysByNumber.set(day.day, day);
  return daysByNumber;
}

export function isUnlocked(day: AdventDay, currentTime: Date = trustedClock()): boolean {
  if (day.is_unlocked_override != null) return day.is_unlocked_override;
  const unlock = parseUnlockTime(day);
  return currentTime.getTime() >= unlock.getTime();
}

function parseUnlockTime(day: AdventDay): Date {
  return parseUnlockTimeValue(day.unlock_time);
}

export function isPlayable(day: AdventDay, opts: { mode?: AdventMode; currentTime?: Date; clock?: AdventClock } = {}): boolean {
  if (opts.mode === "archive") {
    const currentTime = resolveCurrentTime(opts);
    return currentTime.getTime() >= parseUnlockTime(day).getTime();
  }
  if (opts.mode !== undefined && opts.mode !== "live") throw new Error(`Unknown AdventMode: ${String(opts.mode)}`);
  return isUnlocked(day, resolveCurrentTime(opts));
}

export function toDict(day: AdventDay, opts: { includePayload?: boolean; currentTime?: Date; clock?: AdventClock; mode?: AdventMode } = {}): AdventPublicDay {
  const unlocked = isPlayable(day, opts);
  const result: AdventPublicDay = {
    day: day.day,
    title: day.title,
    unlock_time: day.unlock_time,
    content_type: day.content_type,
    is_unlocked: unlocked,
  };
  if (opts.includePayload !== false && unlocked) result.payload = clone(day.payload);
  return result;
}

export async function getManifest(options: AdventQueryOptions = {}): Promise<AdventManifest> {
  const currentTime = resolveCurrentTime(options);
  const { data: days } = await loadCachedAdventCalendar(options);
  const daysData = days.map(d => toDict(d, { includePayload: false, currentTime, mode: options.mode }));
  return { total_days: days.length, days: daysData };
}

export async function getDayContent(dayNumber: number, options: AdventQueryOptions = {}): Promise<AdventPublicDay | null> {
  if (dayNumber < 1 || dayNumber > 24) return null;
  const currentTime = resolveCurrentTime(options);
  const { byDay } = await loadCachedAdventCalendar(options);
  const day = byDay.get(dayNumber);
  if (!day) return null;
  return toDict(day, { includePayload: true, currentTime, mode: options.mode });
}

export function getArchiveDayContent(dayNumber: number, options: AdventQueryOptions = {}): Promise<AdventPublicDay | null> {
  if (options.mode !== undefined && options.mode !== "archive") throw new Error(`getArchiveDayContent called with conflicting mode: ${String(options.mode)}`);
  return getDayContent(dayNumber, { ...options, mode: "archive" });
}

function resolveCurrentTime(options: AdventQueryOptions): Date {
  if (options.currentTime !== undefined && options.clock !== undefined) throw new Error("Pass only one of currentTime or clock");
  return options.currentTime ?? options.clock?.() ?? trustedClock();
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("not found");
}

export function parseDayNumber(rawDay: string): number | null {
  const trimmed = rawDay.trim();
  if (!/^(?:[1-9]|1\d|2[0-4])$/.test(trimmed)) return null;
  return Number(trimmed);
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

function getValidatedDayApiResult(rawDay: string): Promise<AdventApiResult> {
  const dayNumber = parseDayNumber(rawDay);
  if (dayNumber === null) return Promise.resolve(invalidDayResult());
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

export function getDayApiResult(rawDay: string): Promise<AdventApiResult> {
  if (!isAdventEnabled()) return Promise.resolve({ status: 404, body: { error: "Not found" } });
  return getValidatedDayApiResult(rawDay);
}

export async function saveAdventCalendar(days: AdventDay[] | Map<number, AdventDay>, options: AdventFileOptions = {}) {
  const list = days instanceof Map ? Array.from(days.values()) : days;
  const data = {
    days: list.map(d => {
      const serializedDay: Omit<AdventDay, "isCurrentlyUnlocked"> = {
        day: d.day,
        title: d.title,
        unlock_time: d.unlock_time,
        content_type: d.content_type,
        payload: d.payload,
      };
      if (d.is_unlocked_override != null) serializedDay.is_unlocked_override = d.is_unlocked_override;
      return serializedDay;
    }),
  };
  const body = JSON.stringify(data, null, 2);
  if (options.filePath) {
    const absolutePath = path.resolve(options.filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const tmp = `${absolutePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    await fs.writeFile(tmp, body, "utf-8");
    await fs.rename(tmp, absolutePath);
    cache.delete(absolutePath);
    return;
  }
  const store = getSnapshotStore(getSantaSnapshotsBucket());
  await persistAdventCalendar(store, body);
  cache.delete(DATASET_ADVENT);
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
