import { parseJigsaw } from "@/lib/jigsaw";
import { defineActivity } from "./activity";
import { JigsawActivity } from "./jigsaw-component";

export const jigsawActivity = defineActivity({ id: "jigsaw", parse: parseJigsaw, Component: JigsawActivity });
