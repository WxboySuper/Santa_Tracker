"use client";

import { createActivityId } from "@santa-tracker/contracts";
import { migrateActivitySave } from "@santa-tracker/activity-sdk/save";
import { createTranslator, type Translator } from "@santa-tracker/localization";
import { useEffect, useState, type KeyboardEvent } from "react";
import { isWinterWorldTonight, parseLitEntryIds, projectWinterWorldPoint, type WinterWorldConfig } from "@/lib/winter-world";
import { winterWorldEntries, type WinterWorldEntry } from "@/lib/winter-world-data";

const SAVE_KEY = "santa-advent-winterworld-v1";
const ACTIVITY_ID = createActivityId("winterworld");

type SelectEntry = (id: string) => void;

type MapProps = {
  selectedId: string;
  litIds: readonly string[];
  translator: Translator;
  onSelect: SelectEntry;
};

type EntryListProps = MapProps;

type DetailProps = {
  entry: WinterWorldEntry;
  isLit: boolean;
  localDate: Date | null;
  translator: Translator;
  onLight: () => void;
};

type NavigationContext = {
  event: KeyboardEvent;
  currentId: string;
  onSelect: SelectEntry;
  focusList?: boolean;
};

function useWinterWorldProgress() {
  const [litIds, setLitIds] = useState<string[]>([]);
  const [readyToSave, setReadyToSave] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SAVE_KEY);
      if (stored !== null) setLitIds(readSavedLitIds(stored));
    } catch {
      // Blocked storage leaves this visit usable.
    }
    setReadyToSave(true);
  }, []);

  useEffect(() => {
    if (readyToSave) saveLitIds(litIds);
  }, [litIds, readyToSave]);

  function lightEntry(id: string) {
    setLitIds((current) => current.includes(id) ? current : [...current, id]);
  }

  return { litIds, lightEntry };
}

function readSavedLitIds(stored: string): string[] {
  const envelope: unknown = JSON.parse(stored);
  const save = migrateActivitySave<{ lit: unknown }>(envelope, 1, []);
  if (save.activityId !== ACTIVITY_ID || !isRecord(save.payload)) return [];
  return parseLitEntryIds(save.payload.lit);
}

function saveLitIds(litIds: readonly string[]) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      activityId: ACTIVITY_ID,
      schemaVersion: 1,
      savedAtIso: new Date().toISOString(),
      payload: { lit: litIds },
    }));
  } catch {
    // Progress remains available for this visit if storage is unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function handleArrowNavigation({ event, currentId, onSelect, focusList = true }: NavigationContext) {
  const direction = arrowDirection(event.key);
  if (direction === 0) return;
  event.preventDefault();
  const currentIndex = winterWorldEntries.findIndex((entry) => entry.id === currentId);
  const nextIndex = (currentIndex + direction + winterWorldEntries.length) % winterWorldEntries.length;
  const nextEntry = winterWorldEntries[nextIndex];
  if (nextEntry === undefined) return;
  onSelect(nextEntry.id);
  if (focusList) document.getElementById(`winter-entry-${nextEntry.id}`)?.focus();
}

function handleMarkerKeyDown(event: KeyboardEvent, entryId: string, onSelect: SelectEntry) {
  handleArrowNavigation({ event, currentId: entryId, onSelect });
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect(entryId);
}

function arrowDirection(key: string): number {
  if (key === "ArrowDown" || key === "ArrowRight") return 1;
  if (key === "ArrowUp" || key === "ArrowLeft") return -1;
  return 0;
}

function WorldMap({ selectedId, litIds, translator, onSelect }: MapProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-950/20 bg-[#173344] p-2 shadow-inner sm:p-4">
      <svg className="winter-world-map block h-auto w-full" viewBox="0 0 800 240" role="group" aria-label={translator.t("advent.activity.winterworld.mapLabel")}>
        <defs>
          <radialGradient id="world-glow"><stop stopColor="#f8d989" stopOpacity=".3" /><stop offset="1" stopColor="#f8d989" stopOpacity="0" /></radialGradient>
          <filter id="candle-glow" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <rect width="800" height="240" rx="16" fill="#173344" />
        <path d="M40 84 Q400 18 760 84 M40 120 Q400 54 760 120 M40 156 Q400 90 760 156" fill="none" stroke="#c4d7d9" strokeOpacity=".14" />
        <path d="M190 45l20-9 18 6 4 14 19 6 2 17-17 12-8 19-19 6-15-15-21-6-3-21 12-14-8-15zm73 75 13 9 7 22-8 29-13 23-12-7 3-24-11-16 5-21zm123-80 16-9 24 6 6 16-15 6-8 14-18-2-13-12zm42 37 24-11 44 3 21 11 33-5 27 16-11 15-22 0-9 13-30 3-16 17-16-2-7-17-23-7-5-18-22-7zm85 64 21-8 20 9 2 19-22 10-18-13zm-152 40 18-7 21 7 2 11-18 8-21-6z" fill="#9aaf9d" fillOpacity=".66" />
        <path d="M52 202 Q400 228 748 202" fill="none" stroke="#d2a85d" strokeOpacity=".38" strokeDasharray="3 7" />
        {winterWorldEntries.map((entry) => (
          <WorldMapMarker
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            isLit={litIds.includes(entry.id)}
            translator={translator}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </div>
  );
}

function WorldMapMarker({ entry, isSelected, isLit, translator, onSelect }: {
  entry: WinterWorldEntry;
  isSelected: boolean;
  isLit: boolean;
  translator: Translator;
  onSelect: SelectEntry;
}) {
  const { x, y } = projectWinterWorldPoint(entry);
  const label = translator.t("advent.activity.winterworld.selectPlace", { place: translator.t(entry.placeKey) });
  return (
    <g
      className="winter-world-marker"
      role="button"
      tabIndex={isSelected ? 0 : -1}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={() => onSelect(entry.id)}
      onKeyDown={(event) => handleMarkerKeyDown(event, entry.id, onSelect)}
    >
      {isLit ? <circle cx={x} cy={y} r="13" fill="url(#world-glow)" /> : null}
      <circle cx={x} cy={y} r={isSelected ? 8 : 6} fill={isLit ? "#f4cc73" : "#f1eee2"} stroke={isSelected ? "#fff4c5" : "#203846"} strokeWidth={isSelected ? 3 : 2} />
      {isLit ? <circle cx={x} cy={y} r="9" fill="#ffe7a4" opacity=".4" filter="url(#candle-glow)" /> : null}
      <circle cx={x} cy={y} r="13" fill="transparent" />
    </g>
  );
}

function WinterWorldEntryList({ selectedId, litIds, translator, onSelect }: EntryListProps) {
  return (
    <nav aria-label={translator.t("advent.activity.winterworld.listLabel")}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {winterWorldEntries.map((entry) => (
          <WinterWorldEntryButton
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            isLit={litIds.includes(entry.id)}
            translator={translator}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}

function WinterWorldEntryButton({ entry, isSelected, isLit, translator, onSelect }: {
  entry: WinterWorldEntry;
  isSelected: boolean;
  isLit: boolean;
  translator: Translator;
  onSelect: SelectEntry;
}) {
  const place = translator.t(entry.placeKey);
  const label = isLit ? `${place}, ${translator.t("advent.activity.winterworld.candleLit", { place })}` : place;
  return (
    <li>
      <button
        id={`winter-entry-${entry.id}`}
        type="button"
        tabIndex={isSelected ? 0 : -1}
        aria-current={isSelected ? "location" : undefined}
        aria-label={label}
        onClick={() => onSelect(entry.id)}
        onKeyDown={(event) => handleArrowNavigation({ event, currentId: entry.id, onSelect })}
        className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 ${isSelected ? "border-amber-700 bg-white text-slate-950 shadow-sm" : "border-slate-300/80 bg-white/60 text-slate-700 hover:bg-white"}`}
      >
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${isLit ? "bg-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,.45)]" : "bg-slate-300"}`} />
        <span className="min-w-0"><span className="block font-semibold">{translator.t(entry.titleKey)}</span><span className="block truncate text-xs text-slate-600">{place}</span></span>
      </button>
    </li>
  );
}

function WinterWorldDetail({ entry, isLit, localDate, translator, onLight }: DetailProps) {
  const tonight = localDate === null ? null : isWinterWorldTonight(entry, localDate);
  const litLabel = translator.t("advent.activity.winterworld.candleLit", { place: translator.t(entry.placeKey) });
  return (
    <article className="rounded-2xl border border-amber-200 bg-white/75 p-4 sm:p-6" aria-live="polite" aria-atomic="true">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">{translator.t(entry.placeKey)}</p><h3 className="mt-1 font-serif text-2xl font-semibold">{translator.t(entry.titleKey)}</h3></div>
        <TonightLabel tonight={tonight} translator={translator} />
      </div>
      <p className="mt-4 leading-relaxed text-slate-700">{translator.t(entry.storyKey)}</p>
      <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">{translator.t(entry.whenKey)}</p>
      <button type="button" className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" onClick={onLight} aria-pressed={isLit}>
        <CandleIcon isLit={isLit} />
        <span>{isLit ? litLabel : translator.t("advent.activity.winterworld.lightCandle", { place: translator.t(entry.placeKey) })}</span>
      </button>
    </article>
  );
}

function TonightLabel({ tonight, translator }: { tonight: boolean | null; translator: Translator }) {
  if (tonight === null) return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{translator.t("advent.activity.winterworld.dateUnknown")}</span>;
  const message = tonight ? "advent.activity.winterworld.tonight" : "advent.activity.winterworld.notTonight";
  const color = tonight ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>{translator.t(message)}</span>;
}

function CandleIcon({ isLit }: { isLit: boolean }) {
  return (
    <svg className="h-7 w-5" viewBox="0 0 20 30" aria-hidden="true">
      <path d="M5 11h10v17H5z" fill="#f5e8c7" stroke="#d3b978" />
      <path d="M10 2C6 8 8 10 10 12c2-2 4-4 0-10Z" fill={isLit ? "#f5bd50" : "#aab0b3"} />
      {isLit ? <circle cx="10" cy="8" r="6" fill="#ffd875" opacity=".35" filter="url(#candle-glow)" /> : null}
    </svg>
  );
}

export function WinterWorldActivity({ config, locale }: { config: WinterWorldConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const [selectedId, setSelectedId] = useState(config.focus ?? winterWorldEntries[0]?.id ?? "");
  const [localDate, setLocalDate] = useState<Date | null>(null);
  const { litIds, lightEntry } = useWinterWorldProgress();
  const selected = winterWorldEntries.find((entry) => entry.id === selectedId) ?? winterWorldEntries[0]!;
  const allLit = litIds.length === winterWorldEntries.length;

  useEffect(() => setLocalDate(new Date()), []);

  return (
    <section className="winter-world rounded-3xl border border-amber-200/70 bg-[#fbf7ed] p-4 text-slate-900 shadow-sm sm:p-7" aria-labelledby="winter-world-title">
      <ActivityHeader translator={translator} />
      <WorldMap selectedId={selected.id} litIds={litIds} translator={translator} onSelect={setSelectedId} />
      <p className="mt-3 text-center text-sm text-slate-600" aria-live="polite" aria-atomic="true">{translator.t("advent.activity.winterworld.progress", { lit: litIds.length, total: winterWorldEntries.length })}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)]">
        <WinterWorldEntryList selectedId={selected.id} litIds={litIds} translator={translator} onSelect={setSelectedId} />
        <div>
          <WinterWorldDetail entry={selected} isLit={litIds.includes(selected.id)} localDate={localDate} translator={translator} onLight={() => lightEntry(selected.id)} />
          {allLit ? <p className="mt-5 border-t border-amber-200 pt-4 font-serif text-lg leading-relaxed text-amber-950" role="status">{translator.t("advent.activity.winterworld.closing")}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ActivityHeader({ translator }: { translator: Translator }) {
  return (
    <header className="mx-auto mb-6 max-w-3xl text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">{translator.t("advent.activity.winterworld.dayLabel")}</p>
      <h2 id="winter-world-title" className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{translator.t("advent.activity.winterworld.title")}</h2>
      <p className="mx-auto mt-3 max-w-xl leading-relaxed text-slate-700">{translator.t("advent.activity.winterworld.intro")}</p>
    </header>
  );
}
