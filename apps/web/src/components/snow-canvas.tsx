'use client';

import { useEffect, useRef } from 'react';

type Flake = { x: number; y: number; radius: number; sprite: number; speed: number; sway: number; phase: number; alpha: number };

/** One pre-rendered soft dot per size bucket; drawImage is far cheaper than a path fill per flake. */
function makeSprite(radius: number): HTMLCanvasElement {
  const size = Math.ceil(radius * 2 + 4);
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const paint = sprite.getContext('2d');
  if (!paint) return sprite;
  const gradient = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(246, 251, 255, 1)');
  gradient.addColorStop(0.55, 'rgba(246, 251, 255, 0.9)');
  gradient.addColorStop(1, 'rgba(246, 251, 255, 0)');
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, size, size);
  return sprite;
}

const SPRITE_RADII = [1.2, 2.2, 3.6] as const;
const FRAME_MS = 32;

const LAYERS = [
  { share: 0.5, radius: [0.8, 1.5], speed: [14, 24], alpha: 0.45 },
  { share: 0.32, radius: [1.5, 2.4], speed: [26, 40], alpha: 0.7 },
  { share: 0.18, radius: [2.6, 4.2], speed: [46, 70], alpha: 0.9 },
] as const;

function between(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

function createFlakes(width: number, height: number, density: number): Flake[] {
  const total = Math.min(120, Math.max(36, Math.round((width * height) / density)));
  const flakes: Flake[] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [layerIndex, layer] of LAYERS.entries()) {
    const count = Math.round(total * layer.share);
    for (let index = 0; index < count; index += 1) {
      flakes.push({
        x: next() * width,
        y: next() * height,
        radius: between(layer.radius, next()),
        sprite: layerIndex,
        speed: between(layer.speed, next()),
        sway: 8 + next() * 22,
        phase: next() * Math.PI * 2,
        alpha: layer.alpha * (0.7 + next() * 0.3),
      });
    }
  }
  return flakes;
}

/**
 * Soft falling snow in three depth layers. The particle count scales with the viewport and is capped,
 * the loop stops when the tab is hidden or the hero is off screen, and nothing runs for visitors who
 * prefer reduced motion (they get no canvas animation at all).
 */
export default function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const sprites = SPRITE_RADII.map(makeSprite);
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let last = 0;
    let onScreen = true;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      flakes = createFlakes(width, height, width < 700 ? 9000 : 7500);
    };

    const draw = (time: number) => {
      frame = 0;
      // 30 fps is plenty for slow snow and halves the compositing work on every frame.
      if (time - last < FRAME_MS) {
        schedule();
        return;
      }
      const delta = Math.min((time - last) / 1000, 0.05);
      last = time;
      context.clearRect(0, 0, width, height);
      const gust = Math.sin(time / 4200) * 14 + 8;
      for (const flake of flakes) {
        flake.y += flake.speed * delta;
        flake.x += (gust * (flake.radius / 3) + Math.sin(time / 1700 + flake.phase) * flake.sway * 0.4) * delta;
        if (flake.y > height + 6) {
          flake.y = -6;
          flake.x = Math.random() * width;
        }
        if (flake.x > width + 6) flake.x = -6;
        if (flake.x < -6) flake.x = width + 6;
        const sprite = sprites[flake.sprite];
        if (!sprite) continue;
        const scale = (flake.radius * 2 + 4) / sprite.width;
        context.globalAlpha = flake.alpha;
        context.drawImage(sprite, flake.x - (sprite.width * scale) / 2, flake.y - (sprite.height * scale) / 2, sprite.width * scale, sprite.height * scale);
      }
      context.globalAlpha = 1;
      schedule();
    };

    const schedule = () => {
      if (frame || !onScreen || document.visibilityState !== 'visible') return;
      frame = window.requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      if (onScreen) {
        last = performance.now();
        schedule();
      }
    });
    const onVisibility = () => {
      last = performance.now();
      schedule();
    };

    resize();
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="snow-canvas" aria-hidden="true" />;
}
