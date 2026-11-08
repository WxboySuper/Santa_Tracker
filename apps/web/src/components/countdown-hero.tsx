'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { countdownCaption, garlandBulbs } from '@/lib/countdown-captions';
import { countdownTarget, getCountdownParts } from '@/lib/countdown';
import { createNightScene, drawNightScene, type Bulbs, type NightScene } from './countdown-scene';

const FRAME_MS = 1000 / 30;
const STILL_TIME = 2.5;

function useDaysLeft(): number | null {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setDays(getCountdownParts(countdownTarget(now), now).days);
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return days;
}

type Painter = { redraw: () => void; stop: () => void };

/** Sizes the canvas to its box, redraws on resize, and runs the 30 fps loop unless motion is reduced. */
function startPainter(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, bulbsRef: RefObject<Bulbs | null>): Painter {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene: NightScene | null = null;
  let handle = 0;
  let last = 0;
  const still = () => {
    if (scene) drawNightScene(context, scene, STILL_TIME, bulbsRef.current);
  };
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    scene = createNightScene(width, height);
    if (reduced) still();
  };
  const tick = (now: number) => {
    handle = requestAnimationFrame(tick);
    if (document.hidden || !scene || now - last < FRAME_MS) return;
    last = now;
    drawNightScene(context, scene, now / 1000, bulbsRef.current);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (!reduced) handle = requestAnimationFrame(tick);
  return {
    redraw: () => reduced && still(),
    stop: () => {
      cancelAnimationFrame(handle);
      observer.disconnect();
    },
  };
}

function useNightCanvas(canvasRef: RefObject<HTMLCanvasElement | null>, bulbs: Bulbs | null): void {
  const bulbsRef = useRef<Bulbs | null>(bulbs);
  const painter = useRef<Painter | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    painter.current = startPainter(canvas, context, bulbsRef);
    return () => painter.current?.stop();
  }, [canvasRef]);
  useEffect(() => {
    bulbsRef.current = bulbs;
    painter.current?.redraw();
  }, [bulbs]);
}

/**
 * The waiting-room hero: a winter village under the aurora with a string of lights across the top,
 * one bulb for each day until takeoff. A bulb goes dark every day. The garland and caption wait for
 * the real day count, so nothing jumps on load.
 */
export default function CountdownHero({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const days = useDaysLeft();
  const lit = days === null ? null : garlandBulbs(days).lit;
  const bulbs = useMemo<Bulbs | null>(() => (lit === null ? null : { total: garlandBulbs(0).total, lit }), [lit]);
  useNightCanvas(canvasRef, bulbs);
  return (
    <div className="countdown-hero" role="img" aria-label={label}>
      <canvas ref={canvasRef} className="countdown-hero-canvas" />
      <p className="countdown-hero-caption" data-ready={days === null ? 'false' : 'true'}>
        {days === null ? '' : countdownCaption(days)}
      </p>
    </div>
  );
}
