import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";

type ContentType = AdventPublicDay["content_type"];
type Renderer = (day: AdventPublicDay) => ReactNode;

function textOf(day: AdventPublicDay): string | null {
  const text = day.payload?.text;
  return typeof text === "string" && text.trim() !== "" ? text : null;
}

/**
 * One renderer per content type. A type with no renderer (or a payload the renderer cannot use)
 * shows the fallback instead of a blank page, so a day is never a dead end. Add new activity types
 * here; the calendar and day page do not change.
 */
const renderers: Partial<Record<ContentType, Renderer>> = {
  fact: (day) => {
    const text = textOf(day);
    return text ? <p className="text-lg leading-relaxed">{text}</p> : null;
  },
};

export function DayContent({ day, fallback }: { day: AdventPublicDay; fallback: ReactNode }) {
  const rendered = renderers[day.content_type]?.(day) ?? null;
  return <>{rendered ?? fallback}</>;
}
