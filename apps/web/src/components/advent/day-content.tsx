import type { ReactNode } from "react";
import type { AdventPublicDay } from "@/lib/advent";
import { safeEmbedPath } from "@/lib/advent-ui";
import { parseQuiz } from "@/lib/advent-quiz";
import { AdventQuiz } from "./advent-quiz";
import { renderActivity as dispatchActivity } from "./activities";

type ContentType = AdventPublicDay["content_type"];
type Renderer = (day: AdventPublicDay, locale: string) => ReactNode;

function textOf(day: AdventPublicDay): string | null {
  const text = day.payload?.text;
  return typeof text === "string" && text.trim() !== "" ? text : null;
}

function embedPathOf(day: AdventPublicDay): string | null {
  return safeEmbedPath(day.payload?.url);
}

/** A short passage of text: used by facts and by stories, whose payload is also `text`. */
const renderText: Renderer = (day) => {
  const text = textOf(day);
  return text ? <p className="text-lg leading-relaxed">{text}</p> : null;
};

/** An activity shipped as static files, shown in a titled same-origin frame. */
const renderEmbed: Renderer = (day) => {
  const src = embedPathOf(day);
  if (!src) return null;
  return (
    <iframe
      src={src}
      title={day.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="aspect-square max-h-[40rem] w-full rounded-xl border-0 bg-white"
    />
  );
};

const renderQuiz: Renderer = (day, locale) => parseQuiz(day.payload)
  ? <AdventQuiz key={day.day} payload={day.payload} locale={locale} />
  : null;

const renderActivity: Renderer = (day, locale) => dispatchActivity(day, renderEmbed(day, locale));

/**
 * One renderer per content type. A type with no renderer yet (`video`), or a
 * payload the renderer cannot use, shows the fallback instead of a blank page, so a day is never a
 * dead end. Add new activity types here; the calendar and day page do not change.
 */
const renderers: Partial<Record<ContentType, Renderer>> = {
  fact: renderText,
  story: renderText,
  game: renderEmbed,
  quiz: renderQuiz,
  activity: renderActivity,
};

/** The content for a day, or `fallback` when the type has no renderer or the payload is unusable. */
export function renderDayContent(day: AdventPublicDay, fallback: ReactNode, locale = "en"): ReactNode {
  return renderers[day.content_type]?.(day, locale) ?? fallback;
}
