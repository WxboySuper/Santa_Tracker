'use client';

import './north-pole-scene.css';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AuroraRibbon, Gradients, Moon, MountainsFar, MountainsMid, Stars } from './scene-art';
import SnowCanvas from './snow-canvas';
import {
  Foreground,
  ForestBack,
  ForestFront,
  Sleigh,
  VillageLayer,
  TREE_PALETTES,
  type VillageControls,
} from './scene-village';

const INITIALLY_LIT = new Set([0, 2, 3, 5, 6, 8]);

type SceneProps = {
  label: string;
  windowOnLabel: string;
  windowOffLabel: string;
  treeLabel: string;
  soundLabel: string;
  soundOnLabel: string;
  soundOffLabel: string;
};

function fillNumber(template: string, number: number): string {
  return template.replace('{number}', String(number));
}

/**
 * One full-size drawing plane. Every plane is its own SVG element, so the browser can keep it on its
 * own compositor layer: parallax and fades move whole planes without repainting them, and a small
 * animation in one plane never forces the others to redraw.
 */
function Plane({ name, children, interactive = false }: { name: string; children: ReactNode; interactive?: boolean }) {
  return (
    <svg
      className={`scene-plane plane-${name}`}
      viewBox="0 0 1440 860"
      preserveAspectRatio="xMaxYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={interactive ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Eased pointer and scroll parallax. Only CSS custom properties change; nothing re-renders. */
function useParallax(scene: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = scene.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      x += (targetX - x) * 0.1;
      y += (targetY - y) * 0.1;
      element.style.setProperty('--px', `${x}px`);
      element.style.setProperty('--py', `${y}px`);
      if (Math.abs(targetX - x) > 0.05 || Math.abs(targetY - y) > 0.05) frame = window.requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onPointer = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * -22;
      targetY = (event.clientY / window.innerHeight - 0.5) * -10 + Math.max(-14, window.scrollY * -0.02);
      schedule();
    };
    const onScroll = () => {
      targetY = Math.max(-14, Math.min(14, window.scrollY * -0.02));
      schedule();
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [scene]);
}

/** Pauses every CSS animation while the tab is hidden or the hero is scrolled out of view. */
function useSceneActivity(scene: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const element = scene.current;
    let visible = document.visibilityState === 'visible';
    let onScreen = true;
    const update = () => setActive(visible && onScreen);
    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      update();
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      update();
    });
    if (element) observer.observe(element);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scene]);
  return active;
}

/** A soft two-partial chime, synthesized on demand. Only ever called after the visitor opts in. */
function playChime(context: AudioContext, semitone: number) {
  const now = context.currentTime;
  const base = 523.25 * 2 ** (semitone / 12);
  for (const [multiple, level] of [
    [1, 0.09],
    [2.01, 0.035],
  ] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = base * multiple;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.4);
  }
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Creates the shared AudioContext on first use, with the older Safari constructor as a fallback. */
function ensureAudioContext(ref: RefObject<AudioContext | null>): AudioContext | null {
  if (ref.current) return ref.current;
  const Constructor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Constructor) return null;
  ref.current = new Constructor();
  return ref.current;
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];

export default function NorthPoleScene(props: SceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [lit, setLit] = useState<ReadonlySet<number>>(INITIALLY_LIT);
  const [treePalette, setTreePalette] = useState(0);
  const [sound, setSound] = useState(false);
  useParallax(sceneRef);
  const active = useSceneActivity(sceneRef);

  const chime = useCallback(
    (semitone: number) => {
      if (sound && audioRef.current) playChime(audioRef.current, semitone);
    },
    [sound],
  );

  const toggleWindow = useCallback(
    (index: number) => {
      setLit((previous) => {
        const next = new Set(previous);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      chime(SCALE[index % SCALE.length] ?? 0);
    },
    [chime],
  );

  const cycleTree = useCallback(() => {
    setTreePalette((value) => (value + 1) % TREE_PALETTES.length);
    chime(19);
  }, [chime]);

  const toggleSound = useCallback(() => {
    if (!sound) {
      const audio = ensureAudioContext(audioRef);
      if (!audio) return;
      void audio.resume().catch(() => undefined);
    }
    setSound((value) => !value);
  }, [sound]);

  const controls: VillageControls = {
    lit,
    onToggleWindow: toggleWindow,
    windowLabel: (index, isLit) => fillNumber(isLit ? props.windowOnLabel : props.windowOffLabel, index),
    treePalette,
    onCycleTree: cycleTree,
    treeLabel: props.treeLabel,
  };

  return (
    <>
      <div ref={sceneRef} className={`north-pole-scene${active ? '' : ' is-paused'}`} role="group" aria-label={props.label}>
        <svg className="scene-defs" width="0" height="0" aria-hidden="true" focusable="false">
          <Gradients />
        </svg>
        <Plane name="sky">
          <rect width="1440" height="860" fill="url(#sky)" />
          <rect width="1440" height="860" fill="url(#horizon-glow)" />
          <Moon />
        </Plane>
        <Plane name="stars">
          <Stars />
        </Plane>
        <Plane name="aurora-teal">
          <AuroraRibbon name="teal" />
        </Plane>
        <Plane name="aurora-violet">
          <AuroraRibbon name="violet" />
        </Plane>
        <Plane name="aurora-green">
          <AuroraRibbon name="green" />
        </Plane>
        <Plane name="events">
          <path className="shooting-star shooting-star-a" d="M0 0h140" stroke="url(#trail)" strokeWidth="2.4" strokeLinecap="round" />
          <path className="shooting-star shooting-star-b" d="M0 0h96" stroke="url(#trail)" strokeWidth="1.8" strokeLinecap="round" />
          <Sleigh />
        </Plane>
        <Plane name="far">
          <MountainsFar />
        </Plane>
        <Plane name="mid">
          <MountainsMid />
        </Plane>
        <Plane name="forest-back">
          <ForestBack />
        </Plane>
        <Plane name="village" interactive>
          <VillageLayer controls={controls} />
        </Plane>
        <Plane name="mist">
          <rect className="mist" x="-200" y="560" width="1840" height="150" fill="url(#mist)" />
        </Plane>
        <Plane name="forest-front">
          <ForestFront />
        </Plane>
        <Plane name="front">
          <Foreground />
        </Plane>
        <div className="scene-vignette" aria-hidden="true" />
      </div>
      <SnowCanvas />
      <button type="button" className="scene-sound" aria-pressed={sound} onClick={toggleSound}>
        <span aria-hidden="true" className="scene-sound-icon">{sound ? '♪' : '♩'}</span>
        {props.soundLabel}: {sound ? props.soundOnLabel : props.soundOffLabel}
      </button>
    </>
  );
}
