"use client";

import { useMemo, useState } from "react";
import { createTranslator, type MessageKey } from "@santa-tracker/localization";
import { getCityClocks, REFERENCE_END_UTC, REFERENCE_START_UTC, type PuzzleCity, type TimezoneConfig } from "@/lib/timezones";

const CITY_MESSAGE_KEYS: Record<PuzzleCity["id"], MessageKey> = {
  kiritimati: "advent.activity.timezones.city.kiritimati",
  auckland: "advent.activity.timezones.city.auckland",
  tokyo: "advent.activity.timezones.city.tokyo",
  cairo: "advent.activity.timezones.city.cairo",
  london: "advent.activity.timezones.city.london",
  honolulu: "advent.activity.timezones.city.honolulu",
};

export function TimezonesActivity({ locale }: { config: TimezoneConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const [reference, setReference] = useState(REFERENCE_START_UTC);
  const [order, setOrder] = useState<PuzzleCity["id"][]>(["kiritimati", "auckland", "tokyo", "cairo", "london", "honolulu"]);
  const [feedback, setFeedback] = useState("");
  const clocks = useMemo(() => getCityClocks({ referenceInstant: reference, locale }), [locale, reference]);
  const clockById = new Map(clocks.map((city) => [city.id, city]));
  const utcLabel = `${new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(reference)} UTC`;

  function moveCity(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    const next = [...order];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setOrder(next);
    setFeedback("");
  }

  function checkOrder() {
    const correct = [...clocks].sort((left, right) => left.midnightUtc - right.midnightUtc).map(({ id }) => id);
    setFeedback(order.every((city, index) => city === correct[index])
      ? translator.t("advent.activity.timezones.correct")
      : translator.t("advent.activity.timezones.tryAgain"));
  }

  return (
    <section className="space-y-5" aria-labelledby="timezones-title">
      <h2 id="timezones-title" className="text-2xl font-bold">{translator.t("advent.activity.timezones.title")}</h2>
      <p>{translator.t("advent.activity.timezones.instructions")}</p>
      <label className="block space-y-2" htmlFor="timezones-reference">
        <span className="block font-semibold">{translator.t("advent.activity.timezones.reference", { time: utcLabel })}</span>
        <input id="timezones-reference" type="range" min={REFERENCE_START_UTC} max={REFERENCE_END_UTC} step={15 * 60 * 1000} value={reference} onChange={(event) => { setReference(Number(event.currentTarget.value)); setFeedback(""); }} className="w-full accent-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" />
        <span className="flex justify-between text-xs text-slate-300"><span>{translator.t("advent.activity.timezones.rangeStart")}</span><span>{translator.t("advent.activity.timezones.rangeEnd")}</span></span>
      </label>
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-slate-900">{translator.t("advent.activity.timezones.dstNote")}</p>
      <ol className="space-y-2" aria-label={translator.t("advent.activity.timezones.listLabel")}>
        {order.map((id, index) => {
          const city = clockById.get(id);
          if (!city) return null;
          return <li key={id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-sm">{index + 1}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{translator.t(CITY_MESSAGE_KEYS[city.id])}</span><span className="block text-sm text-slate-600">{city.localDate} · {city.localTime} · {formatOffset(city.offsetMinutes)}</span></span>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => moveCity(index, -1)} disabled={index === 0} aria-label={translator.t("advent.activity.timezones.moveUp", { city: translator.t(CITY_MESSAGE_KEYS[city.id]) })} className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-900 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">↑</button>
              <button type="button" onClick={() => moveCity(index, 1)} disabled={index === order.length - 1} aria-label={translator.t("advent.activity.timezones.moveDown", { city: translator.t(CITY_MESSAGE_KEYS[city.id]) })} className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-900 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">↓</button>
            </div>
          </li>;
        })}
      </ol>
      <button type="button" onClick={checkOrder} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">{translator.t("advent.activity.timezones.check")}</button>
      <p aria-live="polite" aria-atomic="true" className="min-h-6 font-medium">{feedback}</p>
    </section>
  );
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
