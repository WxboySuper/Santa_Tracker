import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { cipherActivity } from "./cipher";

export const activityKinds = {
  cipher: cipherActivity,
} as const;

export function hasRegisteredActivityKind(payload: unknown): boolean {
  if (payload === null) return false;
  if (typeof payload !== "object") return false;
  if (Array.isArray(payload)) return false;
  const kind = (payload as Record<string, unknown>).kind;
  if (typeof kind !== "string") return false;
  return Object.hasOwn(activityKinds, kind);
}

export function renderActivity(day: AdventPublicDay, fallback: ReactNode): ReactNode {
  const kind = day.payload?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(activityKinds, kind)) return fallback;
  const activity = activityKinds[kind as keyof typeof activityKinds];
  return activity.render(day.payload) ?? fallback;
}
