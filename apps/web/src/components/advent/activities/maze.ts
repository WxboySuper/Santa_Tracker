import { parseMaze } from "@/lib/maze";
import { defineActivity } from "./activity";
import { MazeActivity } from "./maze-component";

export const mazeActivity = defineActivity({ id: "maze", parse: parseMaze, Component: MazeActivity });
