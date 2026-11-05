"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, createTranslator } from "@santa-tracker/localization";
import { countdownTarget, getCountdownParts, type CountdownParts } from "@/lib/countdown";

interface CountdownTilesProps {
  locale?: string;
  /** Shown instead of the tiles once Santa has taken off. */
  flyingText: string;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Four ornament-style tiles (days, hours, minutes, seconds).
 *
 * Accessibility: the ticking digits are NOT a live region, because announcing every second would
 * drown out a screen reader. The group is a `timer` whose label changes only when the minute does,
 * and the individual tiles are hidden from assistive tech.
 *
 * Before mount the tiles show "--" so server and client markup match and there is no hydration jump.
 */
export default function CountdownTiles({ locale = DEFAULT_LOCALE, flyingText }: CountdownTilesProps) {
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    // Recompute the target every tick so a tab left open across takeoff (or the end of the
    // flight window) switches state on its own.
    const update = () => {
      const now = new Date();
      setParts(getCountdownParts(countdownTarget(now), now));
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (parts?.done) {
    return <p className="text-2xl font-bold text-yellow-300 md:text-3xl">{flyingText}</p>;
  }

  const summary = parts
    ? translator.t("countdown.summary", { days: parts.days, hours: parts.hours, minutes: parts.minutes })
    : translator.t("countdown.loading");

  const tiles = [
    { key: "days", label: translator.t("countdown.days"), value: parts ? String(parts.days) : "--", className: "" },
    { key: "hours", label: translator.t("countdown.hours"), value: parts ? pad(parts.hours) : "--", className: "" },
    { key: "minutes", label: translator.t("countdown.minutes"), value: parts ? pad(parts.minutes) : "--", className: "" },
    { key: "seconds", label: translator.t("countdown.seconds"), value: parts ? pad(parts.seconds) : "--", className: "countdown-seconds" },
  ];

  return (
    <div role="timer" aria-live="off" aria-label={summary} className="mx-auto flex w-full max-w-md justify-center gap-2 sm:max-w-none sm:gap-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          aria-hidden="true"
          className="countdown-tile flex min-w-0 flex-1 flex-col items-center rounded-2xl px-1 py-3 sm:min-w-24 sm:flex-none sm:px-5 sm:py-4"
        >
          <span className={`font-mono text-2xl font-bold tabular-nums text-white min-[400px]:text-3xl sm:text-5xl ${tile.className}`}>
            {tile.value}
          </span>
          <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-wide text-yellow-300 min-[400px]:text-[0.65rem] sm:text-xs sm:tracking-widest">
            {tile.label}
          </span>
        </div>
      ))}
    </div>
  );
}
