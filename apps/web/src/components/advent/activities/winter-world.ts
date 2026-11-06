import { parseWinterWorld } from "@/lib/winter-world";
import { defineActivity } from "./activity";
import { WinterWorldActivity } from "./winter-world-component";

export const winterWorldActivity = defineActivity({ id: "winterworld", parse: parseWinterWorld, Component: WinterWorldActivity });
