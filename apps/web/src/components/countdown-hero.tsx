'use client';

import { useEffect, useRef, useState } from 'react';
import { countdownCaption, garlandBulbs } from '@/lib/countdown-captions';
import { countdownTarget, getCountdownParts } from '@/lib/countdown';
import { drawNightScene, type NightScene, createNightScene } from './countdown-scene';

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

const FRAME_MS = 1000 / 30;

/** The canvas itself. Resizes with its box, pauses in a hidden tab, and draws one still frame under reduced motion. */
function useNightCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, bulbs: { total: number; lit: number }): void {
  const bulbsRef = useRef(bulbs);
  bulbsRef.current = bulbs;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: NightScene | null = null;
    let handle = 0;
    let last = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scene = createNightScene(width, height);
      if (reduced) drawNightScene(context, scene, 2.5, bulbsRef.current);
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
    return () => {
      cancelAnimationFrame(handle);
      observer.disconnect();
    };
  }, [canvasRef]);
}

/**
 * The waiting-room hero: a winter village under the aurora with a string of lights across the top,
 * one bulb for each day until takeoff. A bulb goes dark every day.
 */
export default function CountdownHero({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const days = useDaysLeft();
  const bulbs = garlandBulbs(days ?? 54);
  useNightCanvas(canvasRef, bulbs);
  return (
    <div className="countdown-hero" role="img" aria-label={label}>
      <canvas ref={canvasRef} className="countdown-hero-canvas" />
      {days !== null && (
        <p className="countdown-hero-caption">{countdownCaption(days)}</p>
      )}
    </div>
  );
}
