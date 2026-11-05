import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { cipherActivity } from "./cipher";

export const activityKinds = {
  cipher: cipherActivity,
} as const;

export function hasValidActivityKind(payload: unknown): boolean {
  if (payload === null) return false;
  if (typeof payload !== "object") return false;
  if (Array.isArray(payload)) return false;
  const kind = (payload as Record<string, unknown>).kind;
  if (typeof kind !== "string") return false;
  if (!Object.hasOwn(activityKinds, kind)) return false;
  const activity = activityKinds[kind as keyof typeof activityKinds];
  try {
    return activity.parse(payload) !== null;
  } catch {
    return false;
  }
}

export function renderActivity(day: AdventPublicDay, fallback: ReactNode, locale: string): ReactNode {
  const kind = day.payload?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(activityKinds, kind)) return fallback;
  const activity = activityKinds[kind as keyof typeof activityKinds];
  return activity.render(day.payload, locale) ?? fallback;
}
