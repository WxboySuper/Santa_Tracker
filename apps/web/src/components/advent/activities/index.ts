import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { cipherActivity } from "./cipher";

export const activityKinds = {
  cipher: cipherActivity,
} as const;

export function renderActivity(day: AdventPublicDay, fallback: ReactNode, locale: string): ReactNode {
  const kind = day.payload?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(activityKinds, kind)) return fallback;
  const activity = activityKinds[kind as keyof typeof activityKinds];
  return activity.render(day.payload, locale, String(day.day)) ?? fallback;
}
