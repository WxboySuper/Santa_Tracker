import { describe, expect, it } from "vitest";
import { MAZE_DPAD_LAYOUT } from "@/components/advent/activities/maze-component";
import { generateMaze, mazeConfigKey, mazeNeighbors, moveThroughMaze, parseMaze, solveMaze } from "./maze";

describe("maze", () => {
  it("parses the size and seed defensively", () => {
    expect(parseMaze({ kind: "maze" })).toEqual({ seed: 18, size: "medium" });
    expect(parseMaze({ kind: "maze", seed: -3, size: "large" })).toEqual({ seed: -3, size: "large" });
    expect(parseMaze({ kind: "maze", size: "giant" })).toBeNull();
  });

  it.each(["small", "medium", "large"] as const)("makes a deterministic, solvable perfect %s maze", (size) => {
    const config = { seed: 18, size };
    const maze = generateMaze(config);
    expect(generateMaze(config)).toEqual(maze);
    expect(solveMaze(maze)?.[0]).toBe(maze.start);
    expect(solveMaze(maze)?.at(-1)).toBe(maze.goal);
    expect(maze.cells.reduce((total, _, cell) => total + mazeNeighbors(maze, cell).length, 0) / 2).toBe(maze.cells.length - 1);
  });

  it("blocks moves through walls and permits open paths", () => {
    const maze = generateMaze({ seed: 3, size: "small" });
    expect(moveThroughMaze(maze, maze.start, "up")).toBe(maze.start);
    const openDirection = (Object.keys(maze.cells[0]!.walls) as ("up" | "right" | "down" | "left")[])
      .find((direction) => !maze.cells[0]!.walls[direction]);
    expect(openDirection).toBeDefined();
    expect(moveThroughMaze(maze, maze.start, openDirection!)).not.toBe(maze.start);
  });

  it("uses a new state key when the seed or size changes", () => {
    expect(mazeConfigKey({ seed: 1, size: "small" })).not.toBe(mazeConfigKey({ seed: 1, size: "large" }));
    expect(mazeConfigKey({ seed: 1, size: "small" })).not.toBe(mazeConfigKey({ seed: 2, size: "small" }));
  });

  it("places the d-pad down control in the bottom center cell", () => {
    expect(MAZE_DPAD_LAYOUT).toEqual([null, "up", null, "left", null, "right", null, "down", null]);
  });

  it("keeps seed zero varied and deterministic", () => {
    const zero = generateMaze({ seed: 0, size: "small" });
    expect(generateMaze({ seed: 0, size: "small" })).toEqual(zero);
    expect(zero).not.toEqual(generateMaze({ seed: 1, size: "small" }));
  });

  it("leaves an invalid position unchanged and prevents crossing an open outer wall", () => {
    const maze = generateMaze({ seed: 3, size: "small" });
    for (const current of [-1, maze.cells.length, 1.5, Number.NaN]) {
      expect(moveThroughMaze(maze, current, "up")).toBe(current);
    }
    const broken = { ...maze, cells: maze.cells.map((cell) => ({ walls: { ...cell.walls } })) };
    broken.cells[0]!.walls.up = false;
    expect(moveThroughMaze(broken, 0, "up")).toBe(0);
    broken.cells[8]!.walls.right = false;
    expect(mazeNeighbors(broken, 8)).not.toContain(9);
    expect(solveMaze(broken)?.every((cell) => cell >= 0 && cell < broken.cells.length)).toBe(true);
  });
});
