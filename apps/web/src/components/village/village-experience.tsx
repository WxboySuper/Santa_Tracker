'use client';

import './village.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countdownTarget, getCountdownParts, type CountdownParts } from '@/lib/countdown';
import { MusicBox, TUNES, type MusicState } from './music-box';
import type { BuildingId } from './village-buildings';
import { VillageEngine } from './village-engine';

export type ExperienceStatus = 'open' | 'soon' | 'waiting';

export type Experience = {
  id: BuildingId;
  name: string;
  tagline: string;
  blurb: string;
  status: ExperienceStatus;
  /** Where the primary action goes. Null when there is nowhere to go yet. */
  href: string | null;
  actionLabel: string;
  statusLabel: string;
};

type Hover = { id: BuildingId; x: number; y: number } | null;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function useCountdown(): CountdownParts | null {
  const [parts, setParts] = useState<CountdownParts | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setParts(getCountdownParts(countdownTarget(now), now));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return parts;
}

const two = (value: number) => String(value).padStart(2, '0');

function Countdown({ parts }: { parts: CountdownParts | null }) {
  const cells = parts
    ? [
        ['Days', String(parts.days)],
        ['Hrs', two(parts.hours)],
        ['Min', two(parts.minutes)],
        ['Sec', two(parts.seconds)],
      ]
    : [];
  return (
    <section className="village-countdown" aria-label="Countdown to takeoff">
      <h2>Santa tracker countdown</h2>
      <div role="timer" aria-live="off" className="village-countdown-cells">
        {cells.map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MusicPlayer({ box, state }: { box: MusicBox; state: MusicState }) {
  const tune = TUNES[state.tune] ?? TUNES[0];
  return (
    <section className="village-music" aria-label="Music box">
      <button type="button" className="village-music-button" onClick={() => box.toggle()} aria-pressed={state.playing}>
        <span aria-hidden="true">{state.playing ? '❚❚' : '▶'}</span>
        <span className="village-sr">{state.playing ? 'Pause music' : 'Play music'}</span>
      </button>
      <div className="village-music-title" aria-live="polite">
        <strong>{state.playing ? tune?.title : 'Music box'}</strong>
        <span>{state.playing ? tune?.subtitle : 'Carols, played softly'}</span>
      </div>
      <button type="button" className="village-music-button village-music-next" onClick={() => box.next()}>
        <span aria-hidden="true">⏭</span>
        <span className="village-sr">Next tune</span>
      </button>
    </section>
  );
}

function DetailPanel({ experience, onClose, box, playing }: { experience: Experience; onClose: () => void; box: MusicBox; playing: boolean }) {
  const isMusic = experience.id === 'music';
  return (
    <aside className="village-panel" aria-live="polite" aria-label={experience.name}>
      <button type="button" className="village-panel-close" onClick={onClose}>
        <span aria-hidden="true">←</span> Back to the village
      </button>
      <p className="village-panel-status" data-status={experience.status}>
        {experience.statusLabel}
      </p>
      <h2>{experience.name}</h2>
      <p className="village-panel-tagline">{experience.tagline}</p>
      <p>{experience.blurb}</p>
      <div className="village-panel-actions">
        {isMusic ? (
          <button type="button" className="village-action" onClick={() => box.toggle()}>
            {playing ? 'Pause the music box' : 'Play the music box'}
          </button>
        ) : experience.href ? (
          <Link className="village-action" href={experience.href}>
            {experience.actionLabel} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className="village-action village-action-quiet">{experience.actionLabel}</span>
        )}
      </div>
    </aside>
  );
}

export default function VillageExperience({ experiences }: { experiences: Experience[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VillageEngine | null>(null);
  const boxRef = useRef<MusicBox | null>(null);
  const [box] = useState(() => new MusicBox());
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const [music, setMusic] = useState<MusicState>({ playing: false, tune: 0 });
  const countdown = useCountdown();
  boxRef.current = box;
  const byId = useMemo(() => new Map(experiences.map((entry) => [entry.id, entry])), [experiences]);

  useEffect(() => box.subscribe(setMusic), [box]);
  useEffect(() => () => box.dispose(), [box]);
  useEffect(() => {
    engineRef.current?.setPlaying(music.playing);
  }, [music.playing]);

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
          onSelect: (id) => setSelected(id),
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
  }, []);

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
    if (id) boxRef.current?.chime(id.length % 7);
  }, []);

  const hovered = hover ? byId.get(hover.id) : undefined;
  const current = selected ? byId.get(selected) : undefined;

  return (
    <div className="village" data-ready={ready}>
      <canvas ref={canvasRef} className="village-canvas" role="img" aria-label="An illustrated winter village at the North Pole, with a workshop, arcade, control tower, cinema, music hall, gift shop, stable and observatory around a lit Christmas tree." />
      <div className="village-veil" aria-hidden={ready || !supported}>
        <p>{supported ? 'Lighting the lamps…' : ''}</p>
      </div>
      {!supported && (
        <p className="village-fallback" role="status">
          This browser can’t draw the 3D village, but everything is still a click away in the list below.
        </p>
      )}

      {blocked && (
        <p className="village-notice" role="status">
          Your browser seems to be hiding the 3D scene; some privacy settings block canvas drawing until you allow it for this site. The list of places below still works.
        </p>
      )}

      <header className="village-lockup">
        <p className="village-kicker">The North Pole</p>
        <h1>Santa Tracker</h1>
      </header>
      <nav className="village-topnav" aria-label="Site">
        <Link href="/">Home</Link>
      </nav>

      {hovered && hover && !current && (
        <div className="village-label" style={{ transform: `translate(${hover.x}px, ${hover.y}px)` }} aria-hidden="true">
          <strong>{hovered.name}</strong>
          <span>{hovered.statusLabel}</span>
        </div>
      )}

      <nav className="village-menu" aria-label="Places in the village">
        <ul>
          {experiences.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => choose(entry.id)} aria-pressed={selected === entry.id} data-status={entry.status}>
                <span className="village-dot" aria-hidden="true" />
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <MusicPlayer box={box} state={music} />
      <Countdown parts={countdown} />
      {current && <DetailPanel experience={current} onClose={() => choose(null)} box={box} playing={music.playing} />}
    </div>
  );
}
