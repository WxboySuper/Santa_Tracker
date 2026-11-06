import { describe, expect, it } from "vitest";
import { generateMaze, mazeNeighbors, moveThroughMaze, parseMaze, solveMaze } from "./maze";

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
});
