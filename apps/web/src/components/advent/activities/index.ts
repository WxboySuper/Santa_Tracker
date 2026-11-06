import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { cipherActivity } from "./cipher";
import { jigsawActivity } from "./jigsaw";
import { winterWorldActivity } from "./winter-world";
import { lightshowActivity } from "./lightshow";
import { snowflakeActivity } from "./snowflake";

export const activityKinds = {
  cipher: cipherActivity,
  jigsaw: jigsawActivity,
  winterworld: winterWorldActivity,
  lightshow: lightshowActivity,
  snowflake: snowflakeActivity,
} as const;

export function renderActivity(day: AdventPublicDay, fallback: ReactNode, locale: string): ReactNode {
  const kind = day.payload?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(activityKinds, kind)) return fallback;
  const activity = activityKinds[kind as keyof typeof activityKinds];
  return activity.render(day.payload, locale, String(day.day)) ?? fallback;
}
