'use client';

import './village.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { countdownTarget, getCountdownParts, type CountdownParts } from '@/lib/countdown';
import { MusicBox, TUNES, type MusicState } from './music-box';
import type { BuildingId } from './village-buildings';
import type { Experience } from './build-experiences';
import { useVillageRuntime } from './use-village-runtime';
import VillageStatic from './village-static';

export type { Experience, ExperienceStatus } from './build-experiences';

type Hover = { id: BuildingId; x: number; y: number } | null;

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
  const [box] = useState(() => new MusicBox());
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const [music, setMusic] = useState<MusicState>({ playing: false, tune: 0 });
  const countdown = useCountdown();
  const byId = useMemo(() => new Map(experiences.map((entry) => [entry.id, entry])), [experiences]);
  const { canvasRef, choose } = useVillageRuntime({ box, playing: music.playing, setMusic, setReady, setSupported, setBlocked, setHover, setSelected });

  const hovered = hover ? byId.get(hover.id) : undefined;
  const current = selected ? byId.get(selected) : undefined;

  if (!supported) {
    return <VillageStatic experiences={experiences} note="This browser can’t draw the 3D village, so here is the simple version. Everything is still a click away." />;
  }

  return (
    <div className="village" data-ready={ready}>
      <canvas ref={canvasRef} className="village-canvas" role="img" aria-label="An illustrated winter village at the North Pole, with a workshop, arcade, control tower, cinema, music hall, gift shop, stable and observatory around a lit Christmas tree." />
      <div className="village-veil" aria-hidden={ready}>
        <p>Lighting the lamps…</p>
      </div>
      {blocked && (
        <p className="village-notice" role="status">
          Your browser seems to be hiding the 3D scene; some privacy settings block canvas drawing until you allow it for this site. The list of places below still works.{' '}
          <Link href="/village?view=static">Open the simple version</Link>.
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
