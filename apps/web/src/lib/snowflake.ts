import { createActivityId } from "@santa-tracker/contracts";
import { migrateActivitySave, type ActivitySaveEnvelope } from "@santa-tracker/activity-sdk/save";

export const SNOWFLAKE_ACTIVITY_ID = "advent-snowflake" as const;
export const SNOWFLAKE_SCHEMA_VERSION = 1;
export const SNOWFLAKE_SAVE_KEY = "santa-advent-snowflake-v1";
export const SNOWFLAKE_GRID_SIZE = 8;
export type SnowflakeConfig = { seed?: number };
export type SnowflakeDesign = { cells: number[] };
export type SnowflakeCellCenter = { sector: number; x: number; y: number };

export function parseSnowflake(payload: unknown): SnowflakeConfig | null {
  if (!isRecord(payload) || payload.kind !== "snowflake") return null;
  if (payload.seed === undefined) return {};
  if (typeof payload.seed !== "number" || !Number.isSafeInteger(payload.seed)) return null;
  return { seed: payload.seed >>> 0 };
}

export function normalizeSnowflakeDesign(value: unknown): SnowflakeDesign {
  if (!isRecord(value) || !Array.isArray(value.cells)) return { cells: [] };
  const limit = SNOWFLAKE_GRID_SIZE * SNOWFLAKE_GRID_SIZE;
  const cells = [...new Set(value.cells.filter((cell): cell is number =>
    Number.isInteger(cell) && cell >= 0 && cell < limit && isWedgeCell(cell),
  ))];
  return { cells };
}

export function isWedgeCell(index: number): boolean {
  const row = Math.floor(index / SNOWFLAKE_GRID_SIZE);
  const column = index % SNOWFLAKE_GRID_SIZE;
  return column <= row;
}

export function cellIndex(row: number, column: number): number {
  return row * SNOWFLAKE_GRID_SIZE + column;
}

export function getSnowflakeCellCenters(index: number): SnowflakeCellCenter[] {
  if (!isWedgeCell(index)) return [];
  const row = Math.floor(index / SNOWFLAKE_GRID_SIZE);
  const column = index % SNOWFLAKE_GRID_SIZE;
  const ring = row + 1;
  const radius = 46 * ring / SNOWFLAKE_GRID_SIZE;
  const wedgeAngle = Math.PI / 3 * (column + 0.5) / ring;
  return Array.from({ length: 6 }, (_, sector) => {
    const angle = -Math.PI / 2 + wedgeAngle + sector * Math.PI / 3;
    return { sector, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
}

export function toggleSnowflakeCell(cells: readonly number[], index: number): number[] {
  if (!isWedgeCell(index)) return [...cells];
  return cells.includes(index) ? cells.filter((cell) => cell !== index) : [...cells, index].sort((a, b) => a - b);
}

export function createSurpriseDesign(seed: number): SnowflakeDesign {
  let state = seed >>> 0 || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  const cells: number[] = [];
  for (let row = 1; row < SNOWFLAKE_GRID_SIZE; row += 1) {
    const columns = row + 1;
    const count = row < 3 ? 1 : 1 + Math.floor(random() * Math.min(3, columns));
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(Math.floor(random() * columns));
    for (const column of chosen) cells.push(cellIndex(row, column));
  }
  return { cells: cells.sort((a, b) => a - b) };
}

export function createSnowflakeSave(design: SnowflakeDesign, savedAtIso = new Date().toISOString()): ActivitySaveEnvelope<SnowflakeDesign> {
  return { activityId: createActivityId(SNOWFLAKE_ACTIVITY_ID), schemaVersion: SNOWFLAKE_SCHEMA_VERSION, savedAtIso, payload: normalizeSnowflakeDesign(design) };
}

export function restoreSnowflakeSave(raw: string | null): SnowflakeDesign | null {
  if (!raw) return null;
  try {
    const save = migrateActivitySave<unknown>(JSON.parse(raw), SNOWFLAKE_SCHEMA_VERSION, []);
    if (save.activityId !== SNOWFLAKE_ACTIVITY_ID) return null;
    return normalizeSnowflakeDesign(save.payload);
  } catch {
    return null;
  }
}

export function saveSnowflake(design: SnowflakeDesign): boolean {
  try {
    window.localStorage.setItem(SNOWFLAKE_SAVE_KEY, JSON.stringify(createSnowflakeSave(design)));
    return true;
  } catch {
    return false;
  }
}

export function loadSnowflake(): SnowflakeDesign | null {
  try {
    return restoreSnowflakeSave(window.localStorage.getItem(SNOWFLAKE_SAVE_KEY));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
