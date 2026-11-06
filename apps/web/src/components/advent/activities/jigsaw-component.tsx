"use client";

import { useEffect, useMemo, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { createActivityId } from "@santa-tracker/contracts/ids";
import { migrateActivitySave, type ActivitySaveMigration } from "@santa-tracker/activity-sdk/save";
import { createPieceIds, getCellBounds, getGridSize, getJigsawSaveKey, getNextPiece, isEdgePiece, JIGSAW_ACTIVITY_ID, JIGSAW_SCHEMA_VERSION, normalizeProgress, type JigsawConfig, type JigsawScene } from "@/lib/jigsaw";

const JIGSAW_MIGRATIONS: ActivitySaveMigration[] = [];

export function JigsawActivity({ config, locale }: { config: JigsawConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const saveKey = getJigsawSaveKey(config);
  const [storedPieces, setPlaced] = useState<number[]>([]);
  const [progressKey, setProgressKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [targetCell, setTargetCell] = useState<number | null>(null);
  const [ghost, setGhost] = useState(false);
  const [edgeFirst, setEdgeFirst] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { columns } = getGridSize(config.pieces);
  const ids = useMemo(() => createPieceIds(config.pieces), [config.pieces]);
  const placed = useMemo(() => progressKey === saveKey ? storedPieces : [], [progressKey, saveKey, storedPieces]);
  const complete = placed.length === config.pieces;
  const tray = ids.filter((piece) => !placed.includes(piece)).sort((left, right) => {
    if (!edgeFirst) return left - right;
    const { columns, rows } = getGridSize(config.pieces);
    return Number(isEdgePiece(right, columns, rows)) - Number(isEdgePiece(left, columns, rows)) || left - right;
  });

  useEffect(() => {
    setProgressKey(null);
    setPlaced([]);
    try {
      const raw = window.localStorage.getItem(saveKey);
      if (raw) {
        const saved = migrateActivitySave<{ placed: number[] }>(JSON.parse(raw), JIGSAW_SCHEMA_VERSION, JIGSAW_MIGRATIONS);
        if (saved.activityId === JIGSAW_ACTIVITY_ID) setPlaced(normalizeProgress(saved.payload, config.pieces).placed);
      }
    } catch {
      // Storage is optional; the puzzle remains playable in memory.
    }
    setProgressKey(saveKey);
    setStorageReady(true);
  }, [config.pieces, saveKey]);

  useEffect(() => {
    if (!storageReady || progressKey !== saveKey) return;
    try {
      const envelope = { activityId: createActivityId(JIGSAW_ACTIVITY_ID), schemaVersion: JIGSAW_SCHEMA_VERSION, savedAtIso: new Date().toISOString(), payload: { placed } };
      window.localStorage.setItem(saveKey, JSON.stringify(envelope));
    } catch {
      // A full or blocked store should not interrupt play.
    }
  }, [placed, progressKey, saveKey, storageReady]);

  function placePiece(piece: number, cell: number) {
    if (piece !== cell || placed.includes(piece)) return;
    const next = [...placed, piece];
    setPlaced(next);
    setSelected(null);
    setTargetCell(null);
    setAnnouncement(next.length === config.pieces ? translator.t("advent.activity.jigsaw.complete") : translator.t("advent.activity.jigsaw.placed", { count: next.length, total: config.pieces }));
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>, cell: number) {
    if (selected === null) return;
    event.preventDefault();
    placePiece(selected, cell);
  }

  function handlePieceKey(event: KeyboardEvent<HTMLButtonElement>, piece: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selected === piece && targetCell !== null) placePiece(piece, targetCell);
      else {
        setSelected(piece);
        setTargetCell(piece);
      }
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const direction = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[event.key] as "left" | "right" | "up" | "down";
    if (selected !== piece) {
      setSelected(piece);
      setTargetCell(piece);
      return;
    }
    setTargetCell(getNextPiece({ current: targetCell ?? piece, direction, count: config.pieces, placed, edgeFirst }));
  }

  function startOver() {
    setPlaced([]);
    setSelected(null);
    setTargetCell(null);
    setAnnouncement(translator.t("advent.activity.jigsaw.reset"));
  }

  return (
    <section className="space-y-4" aria-labelledby="jigsaw-title">
      <h2 id="jigsaw-title" className="text-2xl font-bold">{translator.t("advent.activity.jigsaw.title")}</h2>
      <p>{translator.t("advent.activity.jigsaw.instructions")}</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={ghost} onChange={(event) => setGhost(event.currentTarget.checked)} />{translator.t("advent.activity.jigsaw.ghost")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={edgeFirst} onChange={(event) => setEdgeFirst(event.currentTarget.checked)} />{translator.t("advent.activity.jigsaw.edgeFirst")}</label>
        <button type="button" className="underline focus-visible:outline focus-visible:outline-2" onClick={startOver}>{translator.t("advent.activity.jigsaw.startOver")}</button>
      </div>
      <p className="text-sm">{translator.t("advent.activity.jigsaw.progress", { count: placed.length, total: config.pieces })}</p>
      <div className="mx-auto grid w-full max-w-2xl touch-none overflow-hidden rounded-xl bg-slate-900 shadow-lg" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, aspectRatio: "4 / 3" }} aria-label={translator.t("advent.activity.jigsaw.board")}>
        {ids.map((cell) => {
          const bounds = getCellBounds(cell, config.pieces);
          const filled = placed.includes(cell);
          return <button key={cell} type="button" aria-label={translator.t("advent.activity.jigsaw.cell", { count: cell + 1 })} onPointerUp={(event) => handlePointerUp(event, cell)} className={`relative min-w-0 border border-white/20 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${selected !== null ? "cursor-crosshair" : "cursor-default"}`}>
            {targetCell === cell && selected !== null ? <span className="absolute inset-0 z-10 border-2 border-amber-300" aria-hidden="true" /> : null}
            {filled || ghost ? <SceneCrop scene={config.scene} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} revealed={complete} settle={filled} /> : null}
            {!filled && !ghost ? <span className="absolute inset-0 grid place-items-center text-white/40">{cell + 1}</span> : null}
          </button>;
        })}
      </div>
      {!complete ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label={translator.t("advent.activity.jigsaw.tray")}>
        {tray.map((piece) => <button key={piece} type="button" draggable={false} onPointerDown={(event) => handlePointerDown(event, piece, setSelected)} onKeyDown={(event) => handlePieceKey(event, piece)} onClick={() => setSelected(piece)} aria-pressed={selected === piece} aria-label={translator.t("advent.activity.jigsaw.piece", { count: piece + 1, total: config.pieces })} className={`aspect-square overflow-hidden rounded-lg border-2 bg-slate-800 touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${selected === piece ? "border-amber-300 ring-2 ring-amber-300" : "border-slate-300"}`}>
          <SceneCrop scene={config.scene} {...getCellBounds(piece, config.pieces)} />
        </button>)}
      </div> : <div className="rounded-xl bg-slate-100 p-4 text-center"><p className="font-semibold">{translator.t("advent.activity.jigsaw.caption")}</p></div>}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}

function handlePointerDown(event: PointerEvent<HTMLButtonElement>, piece: number, select: (piece: number) => void) {
  event.preventDefault();
  select(piece);
}

function SceneCrop({ scene, x, y, width, height, revealed = false, settle = false }: { scene: JigsawScene; x: number; y: number; width: number; height: number; revealed?: boolean; settle?: boolean }) {
  const viewBox = `${x} ${y} ${width} ${height}`;
  return <svg viewBox={viewBox} preserveAspectRatio="none" className={`h-full w-full ${settle ? "jigsaw-settle" : ""}`} role="img" aria-hidden="true"><SceneArt scene={scene} revealed={revealed} /></svg>;
}

function SceneArt({ scene, revealed }: { scene: JigsawScene; revealed: boolean }) {
  if (scene === "harbor") return <g><rect width="100" height="75" fill="#253858"/><circle cx="78" cy="14" r="7" fill="#f6e7b2"/><path d="M0 42h100v33H0" fill="#29364f"/><path d="M0 56h100v19H0" fill="#172c42"/><path d="M10 43h25v19H10zm31-8h22v27H41zm30 5h20v22H71z" fill="#493d4b"/><path d="M14 47h4v5h-4m9-5h4v5h-4m17-1h4v6h-4m10-6h4v6h-4m21 0h4v6h-4m9-6h4v6h-4" fill={revealed ? "#ffd878" : "#91a1ae"}/><path d="M3 25Q20 8 37 25T70 24T98 23" fill="none" stroke="#f4d594" strokeWidth="1"/>{Array.from({ length: 13 }, (_, i) => <circle key={i} cx={5 + i * 7.5} cy={24 + Math.sin(i) * 2} r="1.2" fill={revealed ? "#ffe8a6" : "#c4cbd0"}/>)}</g>;
  if (scene === "street") return <g><rect width="100" height="75" fill="#71819a"/><path d="M0 54 18 32l18 22V24l18-11 17 11v30l14-17 15 17v21H0" fill="#32435a"/><path d="M0 75 35 53h30l35 22" fill="#e3e8e6"/><path d="M20 39h5v6h-5m15-9h5v6h-5m24-14h5v6h-5m-15 9h5v6h-5m35-2h5v6h-5" fill={revealed ? "#ffe1a0" : "#aebbc4"}/><path d="M0 23Q25 9 48 23T100 20" fill="none" stroke="#f4d594"/><path d="M15 24v7m15-9v7m16-5v7m18-6v7m17-8v7" stroke="#f4d594" strokeWidth=".6"/>{Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 19) % 54} r=".7" fill="#fff" opacity=".8"/>)}</g>;
  return <g><rect width="100" height="75" fill="#7086a0"/><path d="M0 45 16 25l13 17 13-25 20 28 16-21 22 23v28H0" fill="#324b4d"/><path d="M34 43 52 28l19 15v22H34" fill="#493b39"/><path d="M30 44 52 25l23 19" fill="#2a2c32"/><rect x="42" y="49" width="7" height="9" fill={revealed ? "#ffd879" : "#9faeae"}/><rect x="57" y="46" width="7" height="7" fill={revealed ? "#ffd879" : "#9faeae"}/><path d="M0 67q25-12 50 0t50 0v8H0" fill="#eef0eb"/><path d="M8 38v22m9-22v23m68-21v22" stroke="#263c37" strokeWidth="3"/><circle cx="8" cy="37" r="5" fill="#233c35"/><circle cx="17" cy="37" r="4" fill="#2e4b40"/><circle cx="85" cy="38" r="5" fill="#233c35"/>{Array.from({ length: 16 }, (_, i) => <circle key={i} cx={(i * 29) % 100} cy={(i * 17) % 52} r=".7" fill="#fff" opacity=".85"/>)}</g>;
}
