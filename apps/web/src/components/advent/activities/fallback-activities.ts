import type { AdventPublicDay } from "@/lib/advent";

type FallbackKind = "cipher" | "jigsaw" | "snowflake" | "lightshow" | "postcard" | "wordsearch" | "maze" | "timezones";

const fallbackKindByDay: Record<number, FallbackKind> = {
  1: "cipher", 2: "jigsaw", 3: "snowflake", 4: "lightshow", 5: "postcard", 6: "wordsearch",
  7: "maze", 8: "timezones", 9: "jigsaw", 10: "cipher", 11: "postcard", 12: "wordsearch",
  13: "maze", 14: "snowflake", 15: "lightshow", 16: "timezones", 17: "cipher", 18: "jigsaw",
  19: "wordsearch", 20: "postcard", 21: "maze", 22: "snowflake", 23: "timezones", 24: "lightshow",
};

const fallbackPayloads: Record<FallbackKind, (day: number) => Record<string, unknown>> = {
  cipher: () => ({ kind: "cipher", message: "TAKE THE NIGHT SLOWLY", shift: 5, hint: "The kettle can wait." }),
  jigsaw: () => ({ kind: "jigsaw", scene: "cabin", pieces: 12 }),
  snowflake: (day) => ({ kind: "snowflake", seed: 2026 + day }),
  lightshow: () => ({ kind: "lightshow", scene: "tree" }),
  postcard: () => ({ kind: "postcard", scene: "cabin" }),
  wordsearch: (day) => ({ kind: "wordsearch", seed: 2026 + day, words: ["TEAKETTLE", "NIGHTSHIFT", "LAMPLIGHT", "WINDOW"] }),
  maze: (day) => ({ kind: "maze", size: "small", seed: 2026 + day }),
  timezones: () => ({ kind: "timezones" }),
};

/** A day-specific, typed activity that can replace any unusable authored payload. */
export function getAdventFallbackActivity(day: number): AdventPublicDay["payload"] | null {
  const kind = fallbackKindByDay[day];
  return kind ? fallbackPayloads[kind](day) : null;
}
