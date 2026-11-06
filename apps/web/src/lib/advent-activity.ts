import { parseCipher } from "./cipher";
import { parseJigsaw } from "./jigsaw";
import { parseWinterWorld } from "./winter-world";
import { parseLightshow } from "./lightshow";
import { parseSnowflake } from "./snowflake";
import { parsePostcard } from "./postcard";

const activityPayloadParsers = {
  cipher: parseCipher,
  jigsaw: parseJigsaw,
  winterworld: parseWinterWorld,
  lightshow: parseLightshow,
  snowflake: parseSnowflake,
  postcard: parsePostcard,
} as const;

export function hasValidActivityKind(payload: unknown): boolean {
  if (payload === null) return false;
  if (typeof payload !== "object") return false;
  if (Array.isArray(payload)) return false;
  const kind = (payload as Record<string, unknown>).kind;
  if (typeof kind !== "string") return false;
  if (!Object.hasOwn(activityPayloadParsers, kind)) return false;
  try {
    return activityPayloadParsers[kind as keyof typeof activityPayloadParsers](payload) !== null;
  } catch {
    return false;
  }
}
