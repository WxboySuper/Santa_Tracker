export type MazeSize = "small" | "medium" | "large";
export type MazeDirection = "up" | "right" | "down" | "left";

export interface MazeConfig {
  seed: number;
  size: MazeSize;
}

export interface MazeCell {
  walls: Record<MazeDirection, boolean>;
}

export interface Maze {
  width: number;
  height: number;
  cells: MazeCell[];
  start: number;
  goal: number;
}

export function mazeConfigKey(config: MazeConfig): string {
  return `${config.seed}:${config.size}`;
}

interface MazeNeighborContext {
  maze: Maze;
  cell: number;
  direction: MazeDirection;
}

interface MazeSearchContext {
  maze: Maze;
  current: number;
  queue: number[];
  previous: Map<number, number | null>;
}

interface MazeMoveContext {
  maze: Maze;
  current: number;
  direction: MazeDirection;
}

const SIZE_DIMENSIONS: Record<MazeSize, number> = { small: 9, medium: 13, large: 17 };
const REVERSE: Record<MazeDirection, MazeDirection> = { up: "down", right: "left", down: "up", left: "right" };
const DELTAS: Record<MazeDirection, { row: number; column: number }> = {
  up: { row: -1, column: 0 }, right: { row: 0, column: 1 }, down: { row: 1, column: 0 }, left: { row: 0, column: -1 },
};

export function parseMaze(payload: unknown): MazeConfig | null {
  if (!isRecord(payload) || payload.kind !== "maze") return null;
  const seed = readSeed(payload.seed);
  if (seed === null) return null;
  const size = readSize(payload.size);
  if (size === null) return null;
  return { seed, size };
}

function readSeed(value: unknown): number | null {
  if (value === undefined) return 18;
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

function readSize(value: unknown): MazeSize | null {
  if (value === undefined) return "medium";
  if (!isMazeSize(value)) return null;
  return value;
}

function isMazeSize(value: unknown): value is MazeSize {
  switch (value) {
    case "small":
    case "medium":
    case "large":
      return true;
    default:
      return false;
  }
}

export function generateMaze({ seed, size }: MazeConfig): Maze {
  const width = SIZE_DIMENSIONS[size];
  const cells = Array.from({ length: width * width }, () => ({ walls: { up: true, right: true, down: true, left: true } }));
  const random = randomFor(seed);
  const visited = new Set([0]);
  const stack = [0];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    if (current === undefined) break;
    const neighbors = getNeighbors(current, width).filter(({ cell }) => !visited.has(cell));
    if (neighbors.length === 0) { stack.pop(); continue; }
    const next = neighbors[Math.floor(random() * neighbors.length)];
    if (!next) continue;
    cells[current]!.walls[next.direction] = false;
    cells[next.cell]!.walls[REVERSE[next.direction]] = false;
    visited.add(next.cell);
    stack.push(next.cell);
  }

  return { width, height: width, cells, start: 0, goal: width * width - 1 };
}

function getNeighbors(cell: number, width: number): { cell: number; direction: MazeDirection }[] {
  const row = Math.floor(cell / width);
  const column = cell % width;
  return (Object.entries(DELTAS) as [MazeDirection, { row: number; column: number }][])
    .map(([direction, delta]) => ({ direction, cell: (row + delta.row) * width + column + delta.column, row: row + delta.row, column: column + delta.column }))
    .filter(({ row: nextRow, column: nextColumn }) => nextRow >= 0 && nextRow < width && nextColumn >= 0 && nextColumn < width);
}

function randomFor(seed: number): () => number {
  let state = (seed | 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function mazeNeighbors(maze: Maze, cell: number): number[] {
  if (!Number.isInteger(cell)) return [];
  if (cell < 0) return [];
  if (cell >= maze.cells.length) return [];
  return (Object.keys(DELTAS) as MazeDirection[])
    .map((direction) => getOpenNeighbor({ maze, cell, direction }))
    .filter((neighbor): neighbor is number => neighbor !== null);
}

function getOpenNeighbor({ maze, cell, direction }: MazeNeighborContext): number | null {
  const current = maze.cells[cell];
  if (!current) return null;
  if (current.walls[direction]) return null;
  const row = Math.floor(cell / maze.width) + DELTAS[direction].row;
  const column = cell % maze.width + DELTAS[direction].column;
  if (!isInMazeBounds({ maze, row, column })) return null;
  return row * maze.width + column;
}

export function solveMaze(maze: Maze): number[] | null {
  const queue = [maze.start];
  const previous = new Map<number, number | null>([[maze.start, null]]);
  for (const current of queue) {
    visitMazeNeighbors({ maze, current, queue, previous });
  }
  if (!previous.has(maze.goal)) return null;
  return buildPath(previous, maze.goal);
}

function visitMazeNeighbors({ maze, current, queue, previous }: MazeSearchContext): void {
  for (const neighbor of mazeNeighbors(maze, current)) {
    if (previous.has(neighbor)) continue;
    previous.set(neighbor, current);
    queue.push(neighbor);
  }
}

function buildPath(previous: Map<number, number | null>, goal: number): number[] {
  const path: number[] = [];
  let current: number | null = goal;
  while (current !== null) {
    path.push(current);
    current = previous.get(current) ?? null;
  }
  return path.reverse();
}

export function moveThroughMaze(maze: Maze, current: number, direction: MazeDirection): number {
  return getMazeDestination({ maze, current, direction }) ?? current;
}

function getMazeDestination({ maze, current, direction }: MazeMoveContext): number | null {
  if (!isValidMazePosition({ maze, current })) return null;
  const cell = maze.cells[current];
  if (!cell || cell.walls[direction]) return null;
  const row = Math.floor(current / maze.width);
  const column = current % maze.width;
  const nextRow = row + DELTAS[direction].row;
  const nextColumn = column + DELTAS[direction].column;
  if (!isInMazeBounds({ maze, row: nextRow, column: nextColumn })) return null;
  return nextRow * maze.width + nextColumn;
}

function isValidMazePosition({ maze, current }: Pick<MazeMoveContext, "maze" | "current">): boolean {
  if (!Number.isInteger(current)) return false;
  if (current < 0) return false;
  return current < maze.cells.length;
}

function isInMazeBounds({ maze, row, column }: { maze: Maze; row: number; column: number }): boolean {
  if (row < 0 || row >= maze.height) return false;
  return column >= 0 && column < maze.width;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
