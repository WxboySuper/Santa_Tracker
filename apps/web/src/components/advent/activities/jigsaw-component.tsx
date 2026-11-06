"use client";

import { useEffect, useMemo, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { WinterSceneArt as SceneArt } from "./winter-scene-art";
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
