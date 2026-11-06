import { winterWorldEntries, type WinterWorldEntry } from "./winter-world-data";

export type WinterWorldConfig = { focus?: string };

export function parseWinterWorld(payload: unknown): WinterWorldConfig | null {
  if (!isRecord(payload) || payload.kind !== "winterworld") return null;
  if (payload.focus === undefined) return {};
  if (typeof payload.focus !== "string") return null;
  if (!winterWorldEntries.some((entry) => entry.id === payload.focus)) return null;
  return { focus: payload.focus };
}

export function isWinterWorldTonight(entry: WinterWorldEntry, now: Date): boolean | null {
  if (entry.dateRule === undefined || Number.isNaN(now.getTime())) return null;
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  const start = entry.dateRule.startMonth * 100 + entry.dateRule.startDay;
  const end = entry.dateRule.endMonth === undefined || entry.dateRule.endDay === undefined
    ? start
    : entry.dateRule.endMonth * 100 + entry.dateRule.endDay;
  return isWithinDateRange(today, start, end);
}

function isWithinDateRange(today: number, start: number, end: number): boolean {
  if (start <= end) return today >= start && today <= end;
  return today >= start || today <= end;
}

export function projectWinterWorldPoint(entry: WinterWorldEntry): { x: number; y: number } {
  return {
    x: 40 + ((entry.longitude + 180) / 360) * 720,
    y: 24 + ((90 - entry.latitude) / 180) * 192,
  };
}

export function parseLitEntryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(winterWorldEntries.map((entry) => entry.id));
  return [...new Set(value.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
