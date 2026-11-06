import { parsePostcard } from "@/lib/postcard";
import { defineActivity } from "./activity";
import { PostcardActivity } from "./postcard-component";

export const postcardActivity = defineActivity({ id: "postcard", parse: parsePostcard, Component: PostcardActivity });
