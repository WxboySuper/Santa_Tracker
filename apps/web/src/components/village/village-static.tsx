import Link from 'next/link';
import type { Experience } from './village-experience';
import './village-static.css';

type House = { x: number; w: number; h: number; roof: number; lit: boolean };

const HOUSES: readonly House[] = [
  { x: 130, w: 120, h: 92, roof: 52, lit: true },
  { x: 285, w: 96, h: 74, roof: 44, lit: true },
  { x: 410, w: 84, h: 150, roof: 36, lit: true },
  { x: 700, w: 110, h: 84, roof: 50, lit: true },
  { x: 840, w: 96, h: 70, roof: 42, lit: false },
  { x: 965, w: 124, h: 96, roof: 54, lit: true },
];

const STARS = Array.from({ length: 46 }, (_, index) => ({
  x: (index * 263 + 71) % 1160 + 20,
  y: (index * 97 + 13) % 250 + 12,
  r: index % 7 === 0 ? 2.2 : 1.2,
  delay: (index % 9) * 0.6,
}));

function House({ house }: { house: House }) {
  const base = 470;
  const top = base - house.h;
  const mid = house.x + house.w / 2;
  return (
    <g>
      <rect x={house.x} y={top} width={house.w} height={house.h} fill="#2a3552" />
      <polygon points={`${house.x - 8},${top} ${mid},${top - house.roof} ${house.x + house.w + 8},${top}`} fill="#3a4666" />
      <polygon points={`${house.x - 8},${top} ${mid},${top - house.roof} ${mid + 14},${top - house.roof + 8} ${house.x + 14},${top}`} fill="#eaf2ff" opacity="0.9" />
      <rect x={mid - 11} y={base - 38} width="22" height="38" rx="3" fill={house.lit ? '#ffcf70' : '#1b2238'} />
      <rect x={house.x + 14} y={top + 16} width="20" height="20" rx="2" fill={house.lit ? '#ffd98a' : '#1b2238'} />
      <rect x={house.x + house.w - 34} y={top + 16} width="20" height="20" rx="2" fill={house.lit ? '#ffd98a' : '#1b2238'} />
    </g>
  );
}

function Tree() {
  return (
    <g transform="translate(600 470)">
      <rect x="-9" y="-14" width="18" height="18" fill="#4a3426" />
      <polygon points="-78,-10 0,-120 78,-10" fill="#16422f" />
      <polygon points="-62,-70 0,-170 62,-70" fill="#1a4d36" />
      <polygon points="-44,-124 0,-206 44,-124" fill="#1f5b3f" />
      <polygon points="0,-232 7,-212 28,-212 11,-200 17,-180 0,-192 -17,-180 -11,-200 -28,-212 -7,-212" fill="#ffd36a" />
      {[-40, -14, 18, 44, -26, 6, 30, -8].map((x, index) => (
        <circle key={x + index} cx={x} cy={-30 - ((index * 29) % 150)} r="4" fill={index % 2 ? '#ff6b6b' : '#ffd36a'} className="vs-bulb" style={{ animationDelay: `${index * 0.35}s` }} />
      ))}
    </g>
  );
}

function Scene() {
  return (
    <svg className="vs-scene" viewBox="0 0 1200 560" role="img" aria-label="A snowy North Pole village at night, with lit cottages around a glowing Christmas tree under the aurora." preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="vs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070b1e" />
          <stop offset="0.6" stopColor="#14214a" />
          <stop offset="1" stopColor="#2c3a6e" />
        </linearGradient>
        <linearGradient id="vs-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3be8b0" stopOpacity="0" />
          <stop offset="0.4" stopColor="#3be8b0" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="#8f7bff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#8f7bff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="vs-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="560" fill="url(#vs-sky)" />
      <path className="vs-aurora" d="M0 150 C220 70 420 190 640 110 S1000 60 1200 130 L1200 230 C1000 150 820 250 620 190 S240 270 0 220 Z" fill="url(#vs-aurora)" />
      {STARS.map((star) => (
        <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} fill="#fff" className="vs-star" style={{ animationDelay: `${star.delay}s` }} />
      ))}
      <circle cx="1040" cy="150" r="30" fill="#f7f3df" />
      <circle cx="1052" cy="142" r="30" fill="#14214a" opacity="0.18" />
      <path d="M0 400 L150 330 L270 390 L420 300 L560 380 L700 310 L860 385 L1020 320 L1200 390 L1200 560 L0 560 Z" fill="#1c2646" />
      <path d="M0 450 C200 410 400 440 600 425 S1000 405 1200 440 L1200 560 L0 560 Z" fill="#dfe9fb" />
      <circle cx="600" cy="400" r="220" fill="url(#vs-glow)" />
      {HOUSES.map((house) => (
        <House key={house.x} house={house} />
      ))}
      <Tree />
      <path d="M0 482 C260 462 460 492 640 476 S1000 462 1200 486 L1200 560 L0 560 Z" fill="#f4f8ff" />
    </svg>
  );
}

function Card({ entry }: { entry: Experience }) {
  const body = (
    <>
      <span className="vs-status" data-status={entry.status}>
        {entry.statusLabel}
      </span>
      <strong>{entry.name}</strong>
      <span>{entry.tagline}</span>
      <em>{entry.actionLabel}</em>
    </>
  );
  return entry.href ? (
    <Link className="vs-card" href={entry.href}>
      {body}
    </Link>
  ) : (
    <div className="vs-card vs-card-quiet">{body}</div>
  );
}

/**
 * The always-works version of the village: an illustrated night scene and a plain list of places.
 * It needs no WebGL and no client JavaScript, so it is the safe fallback for any device.
 */
export default function VillageStatic({ experiences, note }: { experiences: Experience[]; note?: string }) {
  return (
    <main className="vs">
      <Scene />
      <header className="vs-head">
        <p className="vs-kicker">The North Pole</p>
        <h1>Santa Tracker</h1>
        {note ? <p className="vs-note">{note}</p> : null}
      </header>
      <ul className="vs-grid">
        {experiences.map((entry) => (
          <li key={entry.id}>
            <Card entry={entry} />
          </li>
        ))}
      </ul>
      <nav className="vs-foot" aria-label="Site">
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
