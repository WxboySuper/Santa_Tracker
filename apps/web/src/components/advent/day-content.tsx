import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { safeEmbedPath } from "@/lib/advent-ui";

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
function embedPathOf(day: AdventPublicDay): string | null {
  return safeEmbedPath(day.payload?.url);
}

const renderers: Partial<Record<ContentType, Renderer>> = {
  game: (day) => {
    const src = embedPathOf(day);
    if (!src) return null;
    // Same-origin, our own static files; `title` names the frame for assistive tech.
    return (
      <iframe
        src={src}
        title={day.title}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-[40rem] w-full rounded-xl border-0 bg-white"
      />
    );
  },
  fact: (day) => {
    const text = textOf(day);
    return text ? <p className="text-lg leading-relaxed">{text}</p> : null;
  },
};

/** The content for a day, or `fallback` when the type has no renderer or the payload is unusable. */
export function renderDayContent(day: AdventPublicDay, fallback: ReactNode): ReactNode {
  return renderers[day.content_type]?.(day) ?? fallback;
}
