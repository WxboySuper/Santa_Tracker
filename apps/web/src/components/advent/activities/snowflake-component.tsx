"use client";

import { useEffect, useRef, useState } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { createSurpriseDesign, getSnowflakeCellCenters, loadSnowflake, saveSnowflake, SNOWFLAKE_GRID_SIZE, toggleSnowflakeCell, type SnowflakeConfig } from "@/lib/snowflake";

const ORIGIN = 50;

export function SnowflakeActivity({ config, locale }: { config: SnowflakeConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const [cells, setCells] = useState<number[]>([]);
  const [history, setHistory] = useState<number[][]>([]);
  const [redo, setRedo] = useState<number[][]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [ready, setReady] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const saved = loadSnowflake();
    setCells(saved?.cells ?? (config.seed === undefined ? [] : createSurpriseDesign(config.seed).cells));
    setReady(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [config.seed]);

  useEffect(() => {
    if (!ready) return;
    setStorageAvailable(saveSnowflake({ cells }));
  }, [cells, ready]);

  function commit(next: number[], message: string) {
    setHistory((past) => [...past.slice(-39), cells]);
    setRedo([]);
    setCells(next);
    setAnnouncement(message);
  }

  function toggle(index: number) {
    commit(toggleSnowflakeCell(cells, index), translator.t("advent.activity.snowflake.changed"));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((past) => past.slice(0, -1));
    setRedo((future) => [...future, cells]);
    setCells(previous);
    setAnnouncement(translator.t("advent.activity.snowflake.undone"));
  }

  function redoChange() {
    const next = redo.at(-1);
    if (!next) return;
    setRedo((future) => future.slice(0, -1));
    setHistory((past) => [...past, cells]);
    setCells(next);
    setAnnouncement(translator.t("advent.activity.snowflake.redone"));
  }

  function clear() {
    commit([], translator.t("advent.activity.snowflake.cleared"));
  }

  function surprise() {
    const seed = config.seed ?? Math.floor(Math.random() * 0xffffffff);
    commit(createSurpriseDesign(seed ^ Date.now()).cells, translator.t("advent.activity.snowflake.surprise"));
  }

  function download() {
    const svg = svgRef.current;
    if (!svg) return;
    const markup = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#102333";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "snowflake.png";
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }

  const cellButtons = Array.from({ length: SNOWFLAKE_GRID_SIZE * SNOWFLAKE_GRID_SIZE }, (_, index) => index).filter((index) => Math.floor(index / SNOWFLAKE_GRID_SIZE) >= index % SNOWFLAKE_GRID_SIZE);
  return (
    <section className="space-y-4" aria-labelledby="snowflake-title">
      <h2 id="snowflake-title" className="text-2xl font-bold">{translator.t("advent.activity.snowflake.title")}</h2>
      <p>{translator.t("advent.activity.snowflake.instructions")}</p>
      <div className="relative mx-auto aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl bg-slate-950 p-4">
        {!reducedMotion ? <div className="snowflake-fall" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * -1.4}s` }}>·</i>)}</div> : null}
        <svg ref={svgRef} viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" role="img" aria-label={translator.t("advent.activity.snowflake.preview")}>
          <rect width="100" height="100" fill="#102333" />
          {Array.from({ length: 6 }, (_, sector) => <g key={sector} transform={`rotate(${sector * 60} ${ORIGIN} ${ORIGIN})`}>
            <path d="M50 50 50 4 90 27Z" fill="#18384a" stroke="#7ca2b4" strokeWidth=".35" />
          </g>)}
          {cells.flatMap((index) => getSnowflakeCellCenters(index).map((center) => <rect key={`${index}-${center.sector}`} x={center.x - 2.1} y={center.y - 2.1} width="4.2" height="4.2" rx=".7" fill="#f4edda" stroke="#18384a" strokeWidth=".35" />))}
          <circle cx="50" cy="50" r="2.2" fill="#f5e8c6" />
        </svg>
      </div>
      <div className="mx-auto grid w-full max-w-[18rem] grid-cols-8 gap-1" role="group" aria-label={translator.t("advent.activity.snowflake.editor")}>
        {cellButtons.map((index) => <button key={index} type="button" aria-pressed={cells.includes(index)} aria-label={translator.t("advent.activity.snowflake.cell", { row: Math.floor(index / SNOWFLAKE_GRID_SIZE) + 1, column: index % SNOWFLAKE_GRID_SIZE + 1 })} onClick={() => toggle(index)} className={`aspect-square min-w-0 rounded border border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${cells.includes(index) ? "bg-amber-100" : "bg-slate-800"}`} style={{ gridColumn: `${index % SNOWFLAKE_GRID_SIZE + 1}`, gridRow: `${Math.floor(index / SNOWFLAKE_GRID_SIZE) + 1}` }} />)}
      </div>
      <p className="text-sm">{translator.t("advent.activity.snowflake.editorHint")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={undo} disabled={!history.length} className="rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50">{translator.t("advent.activity.snowflake.undo")}</button>
        <button type="button" onClick={redoChange} disabled={!redo.length} className="rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50">{translator.t("advent.activity.snowflake.redo")}</button>
        <button type="button" onClick={clear} className="rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">{translator.t("advent.activity.snowflake.clear")}</button>
        <button type="button" onClick={surprise} className="rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">{translator.t("advent.activity.snowflake.surpriseButton")}</button>
        <button type="button" onClick={download} className="rounded-lg bg-amber-200 px-3 py-2 font-semibold text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">{translator.t("advent.activity.snowflake.download")}</button>
      </div>
      <p className="text-sm" aria-live="polite">{translator.t(storageAvailable ? "advent.activity.snowflake.saved" : "advent.activity.snowflake.saveUnavailable")}</p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}
