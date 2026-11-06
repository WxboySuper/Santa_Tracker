"use client";

import { useMemo, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { generateWordsearch, wordAtSelection, type WordsearchConfig } from "@/lib/wordsearch";

const GRID_SIZE = 15;

export function WordsearchActivity({ config, locale }: { config: WordsearchConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const puzzle = useMemo(() => generateWordsearch(config), [config]);
  const [found, setFound] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const complete = found.length === config.words.length;
  const highlighted = new Set(puzzle.placements.filter(({ word }) => found.includes(word)).flatMap(({ cells }) => cells));
  const preview = anchor === null || dragEnd === null ? [] : wordAtSelection(anchor, dragEnd, GRID_SIZE) ?? [];

  function finishSelection(start: number, end: number) {
    const cells = wordAtSelection(start, end, GRID_SIZE);
    if (!cells) return;
    const letters = cells.map((cell) => puzzle.grid[Math.floor(cell / GRID_SIZE)]?.[cell % GRID_SIZE]).join("");
    const reverse = letters.split("").reduce((reversed, letter) => letter + reversed, "");
    const word = config.words.find((candidate) => (candidate === letters || candidate === reverse) && !found.includes(candidate));
    setAnchor(null);
    setDragEnd(null);
    if (!word) return;
    const next = [...found, word];
    setFound(next);
    setAnnouncement(translator.t("advent.activity.wordsearch.found", { word }));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    const cell = getCell(event.target);
    if (cell === null) return;
    event.preventDefault();
    setAnchor(cell);
    setDragEnd(cell);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (anchor === null || event.buttons === 0) return;
    const cell = getCell(event.target);
    if (cell !== null) setDragEnd(cell);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (anchor === null) return;
    const cell = getCell(event.target);
    if (cell !== null) finishSelection(anchor, cell);
    else { setAnchor(null); setDragEnd(null); }
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, cell: number) {
    const row = Math.floor(cell / GRID_SIZE);
    const column = cell % GRID_SIZE;
    const delta = {
      ArrowLeft: column > 0 ? -1 : 0,
      ArrowRight: column < GRID_SIZE - 1 ? 1 : 0,
      ArrowUp: row > 0 ? -GRID_SIZE : 0,
      ArrowDown: row < GRID_SIZE - 1 ? GRID_SIZE : 0,
    }[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = Math.min(GRID_SIZE * GRID_SIZE - 1, Math.max(0, cell + delta));
      setCursor(next);
      if (anchor !== null) setDragEnd(next);
      document.getElementById(`wordsearch-cell-${next}`)?.focus();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (anchor === null) { setAnchor(cell); setDragEnd(cell); }
    else finishSelection(anchor, cell);
  }

  return (
    <section className="space-y-4" aria-labelledby="wordsearch-title">
      <h2 id="wordsearch-title" className="text-2xl font-bold">{translator.t("advent.activity.wordsearch.title")}</h2>
      <p>{translator.t("advent.activity.wordsearch.instructions")}</p>
      <div className="mx-auto grid w-full max-w-xl grid-cols-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm" style={{ touchAction: "none" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
        {puzzle.grid.flatMap((row, rowIndex) => row.map((letter, columnIndex) => {
          const cell = rowIndex * GRID_SIZE + columnIndex;
          const selected = preview.includes(cell) || anchor === cell;
          return <button key={cell} id={`wordsearch-cell-${cell}`} type="button" data-cell={cell} tabIndex={cursor === cell ? 0 : -1} aria-pressed={anchor === cell} aria-label={translator.t("advent.activity.wordsearch.cell", { row: rowIndex + 1, column: columnIndex + 1, letter })} onFocus={() => setCursor(cell)} onKeyDown={(event) => handleKey(event, cell)} className={`aspect-square min-w-0 border border-slate-200 font-mono text-xs font-semibold sm:text-base focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${cursor === cell ? "ring-1 ring-inset ring-sky-700" : ""} ${highlighted.has(cell) ? "bg-amber-200 text-slate-950" : selected ? "bg-sky-200 text-slate-950" : "text-slate-800"}`}>{letter}</button>;
        }))}
      </div>
      <div>
        <h3 className="mb-2 font-semibold">{translator.t("advent.activity.wordsearch.listTitle")}</h3>
        <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label={translator.t("advent.activity.wordsearch.listTitle")}>
          {config.words.map((word) => <li key={word} className={found.includes(word) ? "line-through text-slate-500" : "font-medium"}>{word}</li>)}
        </ul>
      </div>
      {complete ? <p className="rounded-xl bg-amber-50 p-4 text-center font-medium">{translator.t("advent.activity.wordsearch.complete")}</p> : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}

function getCell(target: EventTarget): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest<HTMLElement>("[data-cell]")?.dataset.cell;
  if (cell === undefined) return null;
  const value = Number(cell);
  return Number.isInteger(value) && value >= 0 && value < GRID_SIZE * GRID_SIZE ? value : null;
}
