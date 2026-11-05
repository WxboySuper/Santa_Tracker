"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LOCALE, createTranslator } from "@santa-tracker/localization";
import { countdownTarget, getCountdownParts, type CountdownParts } from "@/lib/countdown";

interface CountdownTilesProps {
  locale?: string;
  /** Shown instead of the tiles once Santa has taken off. */
  flyingText: string;
}

type Translator = ReturnType<typeof createTranslator>;
type Tile = { key: string; label: string; value: string; className: string };

const pad = (value: number): string => String(value).padStart(2, "0");

/** Ticks once a second. The target is recomputed each tick so a tab left open across takeoff (or the
 * end of the flight window) switches state on its own. Null until mounted, so server and client
 * markup match. */
function useCountdownParts(): CountdownParts | null {
  const [parts, setParts] = useState<CountdownParts | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setParts(getCountdownParts(countdownTarget(now), now));
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return parts;
}

/** When takeoff arrives while the page is open, ask the server to re-render: the Track Santa button
 * and nav links are decided server-side and should appear without a manual reload. */
function useRefreshAtTakeoff(parts: CountdownParts | null): void {
  const router = useRouter();
  const sawCountdown = useRef(false);
  const done = parts?.done === true;
  useEffect(() => {
    if (parts && !parts.done) sawCountdown.current = true;
    if (done && sawCountdown.current) {
      sawCountdown.current = false;
      router.refresh();
    }
  }, [done, parts, router]);
}

function buildTiles(parts: CountdownParts | null, translator: Translator): Tile[] {
  const show = (value: number | undefined, format: (n: number) => string) => (value === undefined ? "--" : format(value));
  return [
    { key: "days", label: translator.t("countdown.days"), value: show(parts?.days, String), className: "" },
    { key: "hours", label: translator.t("countdown.hours"), value: show(parts?.hours, pad), className: "" },
    { key: "minutes", label: translator.t("countdown.minutes"), value: show(parts?.minutes, pad), className: "" },
    { key: "seconds", label: translator.t("countdown.seconds"), value: show(parts?.seconds, pad), className: "countdown-seconds" },
  ];
}

function summaryText(parts: CountdownParts | null, translator: Translator): string {
  if (!parts) return translator.t("countdown.loading");
  return translator.t("countdown.summary", { days: parts.days, hours: parts.hours, minutes: parts.minutes });
}

function CountdownTile({ tile }: { tile: Tile }) {
  return (
    <div
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
  );
}

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
  const parts = useCountdownParts();
  useRefreshAtTakeoff(parts);

  if (parts?.done) {
    return <p className="text-2xl font-bold text-yellow-300 md:text-3xl">{flyingText}</p>;
  }

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={summaryText(parts, translator)}
      className="mx-auto flex w-full max-w-md justify-center gap-2 sm:max-w-none sm:gap-4"
    >
      {buildTiles(parts, translator).map((tile) => (
        <CountdownTile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}
