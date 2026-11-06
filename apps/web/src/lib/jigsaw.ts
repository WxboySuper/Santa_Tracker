export type JigsawScene = "cabin" | "harbor" | "street";
export type JigsawPieceCount = 12 | 24 | 48;

export interface JigsawConfig {
  scene: JigsawScene;
  pieces: JigsawPieceCount;
}

export interface JigsawProgress {
  placed: number[];
}

export const JIGSAW_SCHEMA_VERSION = 1;
export const JIGSAW_ACTIVITY_ID = "advent-jigsaw" as const;

export function parseJigsaw(payload: unknown): JigsawConfig | null {
  if (!isRecord(payload) || payload.kind !== "jigsaw") return null;
  const scene = parseScene(payload.scene);
  const pieces = parsePieceCount(payload.pieces);
  if (scene === null || pieces === null) return null;
  return { scene, pieces };
}

function parseScene(value: unknown): JigsawScene | null {
  if (value === undefined) return "cabin";
  if (value === "cabin") return value;
  if (value === "harbor") return value;
  if (value === "street") return value;
  return null;
}

function parsePieceCount(value: unknown): JigsawPieceCount | null {
  if (value === undefined) return 24;
  if (value === 12) return value;
  if (value === 24) return value;
  if (value === 48) return value;
  return null;
}

export function createPieceIds(count: JigsawPieceCount): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

export function getGridSize(count: JigsawPieceCount): { columns: number; rows: number } {
  const columns = count === 12 ? 4 : count === 24 ? 6 : 8;
  return { columns, rows: count / columns };
}

export function normalizeProgress(value: unknown, count: JigsawPieceCount): JigsawProgress {
  if (!isRecord(value) || !Array.isArray(value.placed)) return { placed: [] };
  const placed = [...new Set(value.placed.filter((piece): piece is number =>
    Number.isInteger(piece) && piece >= 0 && piece < count,
  ))];
  return { placed };
}

export function getNextPiece({
  current,
  direction,
  count,
  placed,
  edgeFirst,
}: {
  current: number;
  direction: "left" | "right" | "up" | "down";
  count: JigsawPieceCount;
  placed: readonly number[];
  edgeFirst: boolean;
}): number {
  const { columns, rows } = getGridSize(count);
  const occupied = new Set(placed);
  const candidates = createPieceIds(count).filter((piece) => !occupied.has(piece));
  const allowed = edgeFirst ? candidates.filter((piece) => isEdgePiece(piece, columns, rows)) : candidates;
  const choices = allowed.length ? allowed : candidates;
  const x = current % columns;
  const y = Math.floor(current / columns);
  const delta = direction === "left" ? { x: -1, y: 0 } : direction === "right" ? { x: 1, y: 0 } : direction === "up" ? { x: 0, y: -1 } : { x: 0, y: 1 };
  return choices.reduce((best, piece) => {
    const distance = Math.abs(piece % columns - (x + delta.x)) + Math.abs(Math.floor(piece / columns) - (y + delta.y));
    const bestDistance = Math.abs(best % columns - (x + delta.x)) + Math.abs(Math.floor(best / columns) - (y + delta.y));
    return distance < bestDistance ? piece : best;
  }, choices[0] ?? 0);
}

export function isEdgePiece(piece: number, columns: number, rows: number): boolean {
  const x = piece % columns;
  const y = Math.floor(piece / columns);
  return x === 0 || y === 0 || x === columns - 1 || y === rows - 1;
}

export function getCellBounds(piece: number, count: JigsawPieceCount): { x: number; y: number; width: number; height: number } {
  const { columns, rows } = getGridSize(count);
  return { x: (piece % columns) * 100 / columns, y: Math.floor(piece / columns) * 75 / rows, width: 100 / columns, height: 75 / rows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
