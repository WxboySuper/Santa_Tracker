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

const SIZE_DIMENSIONS: Record<MazeSize, number> = { small: 9, medium: 13, large: 17 };
const REVERSE: Record<MazeDirection, MazeDirection> = { up: "down", right: "left", down: "up", left: "right" };
const DELTAS: Record<MazeDirection, { row: number; column: number }> = {
  up: { row: -1, column: 0 }, right: { row: 0, column: 1 }, down: { row: 1, column: 0 }, left: { row: 0, column: -1 },
};

export function parseMaze(payload: unknown): MazeConfig | null {
  if (!isRecord(payload) || payload.kind !== "maze") return null;
  const seed = payload.seed === undefined ? 18 : payload.seed;
  const size = payload.size === undefined ? "medium" : payload.size;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) return null;
  if (size !== "small" && size !== "medium" && size !== "large") return null;
  return { seed, size };
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
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function mazeNeighbors(maze: Maze, cell: number): number[] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= maze.cells.length) return [];
  return (Object.keys(DELTAS) as MazeDirection[])
    .filter((direction) => !maze.cells[cell]?.walls[direction])
    .map((direction) => cell + DELTAS[direction].row * maze.width + DELTAS[direction].column);
}

export function solveMaze(maze: Maze): number[] | null {
  const queue = [maze.start];
  const previous = new Map<number, number | null>([[maze.start, null]]);
  for (const current of queue) {
    if (current === maze.goal) return buildPath(previous, maze.goal);
    for (const neighbor of mazeNeighbors(maze, current)) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      queue.push(neighbor);
    }
  }
  return null;
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
  if (maze.cells[current]?.walls[direction]) return current;
  return current + DELTAS[direction].row * maze.width + DELTAS[direction].column;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
