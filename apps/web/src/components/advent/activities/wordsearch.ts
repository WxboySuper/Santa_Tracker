import { parseWordsearch } from "@/lib/wordsearch";
import { defineActivity } from "./activity";
import { WordsearchActivity } from "./wordsearch-component";

export const wordsearchActivity = defineActivity({ id: "wordsearch", parse: parseWordsearch, Component: WordsearchActivity });
