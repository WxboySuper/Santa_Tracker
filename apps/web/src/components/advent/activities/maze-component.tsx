"use client";

import { useMemo, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { generateMaze, moveThroughMaze, type MazeConfig, type MazeDirection } from "@/lib/maze";

const KEY_DIRECTIONS: Record<string, MazeDirection> = {
  ArrowUp: "up", w: "up", W: "up", ArrowRight: "right", d: "right", D: "right",
  ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left",
};

export function MazeActivity({ config, locale }: { config: MazeConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const maze = useMemo(() => generateMaze(config), [config]);
  const [position, setPosition] = useState(maze.start);
  const [trail, setTrail] = useState<number[]>([maze.start]);
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const complete = position === maze.goal;

  function move(direction: MazeDirection) {
    const next = moveThroughMaze(maze, position, direction);
    if (next === position) return;
    setPosition(next);
    setTrail((path) => [...path, next]);
    setAnnouncement(next === maze.goal ? translator.t("advent.activity.maze.complete") : translator.t("advent.activity.maze.position", { row: Math.floor(next / maze.width) + 1, column: next % maze.width + 1 }));
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    setSwipeStart({ x: event.clientX, y: event.clientY });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    setSwipeStart(null);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  function reset() {
    setPosition(maze.start);
    setTrail([maze.start]);
    setAnnouncement("");
  }

  return (
    <section className="space-y-4" aria-labelledby="maze-title">
      <h2 id="maze-title" className="text-2xl font-bold">{translator.t("advent.activity.maze.title")}</h2>
      <p>{translator.t("advent.activity.maze.instructions")}</p>
      <div
        className="mx-auto grid w-full max-w-xl touch-none overflow-hidden rounded-xl bg-slate-800 p-2 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
        style={{ gridTemplateColumns: `repeat(${maze.width}, minmax(0, 1fr))`, aspectRatio: "1" }}
        role="group"
        tabIndex={0}
        aria-label={translator.t("advent.activity.maze.board")}
        onKeyDown={handleKey}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {maze.cells.map((cell, index) => {
          const atStart = index === maze.start;
          const atGoal = index === maze.goal;
          const isCurrent = index === position;
          const hasTrail = trail.includes(index) && !isCurrent;
          return <div key={index} aria-hidden="true" className={`relative min-w-0 ${atGoal ? "bg-amber-100" : atStart ? "bg-slate-300" : "bg-slate-100"}`} style={{ borderTop: cell.walls.up ? "2px solid #334155" : "2px solid transparent", borderRight: cell.walls.right ? "2px solid #334155" : "2px solid transparent", borderBottom: cell.walls.down ? "2px solid #334155" : "2px solid transparent", borderLeft: cell.walls.left ? "2px solid #334155" : "2px solid transparent" }}>
            {hasTrail ? <span className="absolute inset-1/4 rounded-full bg-sky-300/40" aria-hidden="true" /> : null}
            {isCurrent ? <span className="absolute inset-[18%] rounded-full bg-sky-700 ring-2 ring-white" aria-hidden="true" /> : null}
            {atGoal ? <span className="absolute inset-[20%] rounded-sm border-2 border-amber-500 bg-amber-300" aria-hidden="true" /> : null}
            {atStart ? <span className="absolute inset-[30%] rounded-full bg-white" aria-hidden="true" /> : null}
          </div>;
        })}
      </div>
      <p className="text-center text-sm text-slate-300">{translator.t("advent.activity.maze.swipe")}</p>
      <div className="mx-auto grid w-40 grid-cols-3 gap-2" aria-label={translator.t("advent.activity.maze.controls")}>
        <span />
        <DirectionButton direction="up" label={translator.t("advent.activity.maze.up")} onMove={move} />
        <span />
        <DirectionButton direction="left" label={translator.t("advent.activity.maze.left")} onMove={move} />
        <DirectionButton direction="down" label={translator.t("advent.activity.maze.down")} onMove={move} />
        <DirectionButton direction="right" label={translator.t("advent.activity.maze.right")} onMove={move} />
      </div>
      {complete ? <p className="rounded-xl bg-amber-50 p-4 text-center font-medium">{translator.t("advent.activity.maze.complete")}</p> : null}
      <div className="text-center"><button type="button" onClick={reset} className="rounded-lg border border-slate-400 px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">{translator.t("advent.activity.maze.reset")}</button></div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}

function DirectionButton({ direction, label, onMove }: { direction: MazeDirection; label: string; onMove: (direction: MazeDirection) => void }) {
  const icons: Record<MazeDirection, string> = { up: "↑", right: "→", down: "↓", left: "←" };
  return <button type="button" aria-label={label} onClick={() => onMove(direction)} className="aspect-square rounded-lg border border-slate-400 bg-white text-xl font-semibold text-slate-900 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">{icons[direction]}</button>;
}
