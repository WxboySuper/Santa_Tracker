'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { VillageEngine } from './village-engine';
import type { BuildingId } from './village-buildings';
import type { MusicBox } from './music-box';

type Hover = { id: BuildingId; x: number; y: number } | null;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function useVillageRuntime({
  box,
  playing,
  setMusic,
  setReady,
  setSupported,
  setBlocked,
  setHover,
  setSelected,
}: {
  box: MusicBox;
  playing: boolean;
  setMusic: Dispatch<SetStateAction<{ playing: boolean; tune: number }>>;
  setReady: Dispatch<SetStateAction<boolean>>;
  setSupported: Dispatch<SetStateAction<boolean>>;
  setBlocked: Dispatch<SetStateAction<boolean>>;
  setHover: Dispatch<SetStateAction<Hover>>;
  setSelected: Dispatch<SetStateAction<BuildingId | null>>;
}): {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  engineRef: RefObject<VillageEngine | null>;
  choose: (id: BuildingId | null) => void;
} {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VillageEngine | null>(null);
  const boxRef = useRef<MusicBox>(box);
  boxRef.current = box;

  useEffect(() => box.subscribe(setMusic), [box, setMusic]);
  useEffect(() => () => box.dispose(), [box]);
  useEffect(() => {
    engineRef.current?.setPlaying(playing);
  }, [playing]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setSupported(false);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let engine: VillageEngine | null = null;
    try {
      engine = new VillageEngine({
        canvas,
        reducedMotion,
        events: {
          onHover: (id, anchor) => setHover(id && anchor ? { id, x: anchor.x, y: anchor.y } : null),
          onSelect: setSelected,
          onReady: () => setReady(true),
          onFail: () => setSupported(false),
          onBlocked: () => setBlocked(true),
        },
      });
    } catch {
      setSupported(false);
      return;
    }
    engineRef.current = engine;
    if (process.env.NODE_ENV !== 'production') Object.assign(window, { __villageEngine: engine, __villageMusic: boxRef.current });
    engine.start();
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, [setBlocked, setHover, setReady, setSelected, setSupported]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') engineRef.current?.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = useCallback((id: BuildingId | null) => {
    if (engineRef.current) engineRef.current.select(id);
    else setSelected(id);
    if (id) boxRef.current.chime(id.length % 7);
  }, [setSelected]);
  return { canvasRef, engineRef, choose };
}
