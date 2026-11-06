import type { CSSProperties, ReactNode } from 'react';

/**
 * Static building blocks for the North Pole scene. Everything here is deterministic so the server
 * and the browser render identical markup (no Math.random, no Date).
 */

/** A tiny deterministic PRNG (mulberry32) so generated art never differs between server and client. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; r: number; tone: 0 | 1 | 2; delay: number; duration: number; cross: boolean };

function makeStars(): Star[] {
  const random = seeded(2026);
  return Array.from({ length: 118 }, (_, index) => {
    const size = random();
    return {
      x: Math.round(random() * 1440),
      y: Math.round(random() * 470),
      r: size > 0.93 ? 2.2 : size > 0.6 ? 1.5 : 1,
      tone: (index % 3) as 0 | 1 | 2,
      delay: Math.round(random() * 90) / 10,
      duration: 2.6 + Math.round(random() * 40) / 10,
      cross: size > 0.965,
    };
  });
}

const STARS = makeStars();
const STAR_FILL = ['#fff6dd', '#cfe4ff', '#ffe2b8'] as const;

export function Stars() {
  return (
    <g className="scene-stars" aria-hidden="true">
      {STARS.map((star, index) => (
        <g key={index} className={index % 5 === 0 || star.cross ? 'scene-star scene-star-live' : 'scene-star'} style={{ '--delay': `${star.delay}s`, '--dur': `${star.duration}s` } as CSSProperties}>
          <circle cx={star.x} cy={star.y} r={star.r} fill={STAR_FILL[star.tone]} />
          {star.cross && (
            <path
              d={`M${star.x - 7} ${star.y}h14M${star.x} ${star.y - 7}v14`}
              stroke={STAR_FILL[star.tone]}
              strokeWidth="0.8"
              opacity="0.7"
            />
          )}
        </g>
      ))}
    </g>
  );
}

export function Moon() {
  return (
    <g className="scene-moon" aria-hidden="true">
      <circle cx="318" cy="168" r="260" fill="url(#moon-halo)" />
      <circle cx="318" cy="168" r="62" fill="url(#moon-face)" />
      <g fill="#c9c6b4" opacity="0.42">
        <circle cx="298" cy="150" r="13" />
        <circle cx="338" cy="188" r="9" />
        <circle cx="322" cy="136" r="5" />
        <circle cx="296" cy="192" r="6" />
      </g>
      <path d="M268 160a52 52 0 0 1 52-46 62 62 0 0 0-52 46Z" fill="#fffdf0" opacity="0.55" />
    </g>
  );
}

export type AuroraName = 'teal' | 'violet' | 'green';

const AURORA_PATHS: Record<AuroraName, string> = {
  teal: 'M-120 200C130 40 290 300 540 190s370-30 540-96 270-10 480 76v140c-220-84-322-40-500-4s-314 58-526 6S170 300-120 350Z',
  violet: 'M-60 270c230-170 380-26 600-54s285-132 505-100 295 94 440 40v118c-176 82-298 4-466-8s-336 90-516 96S210 310-60 392Z',
  green: 'M180 150c180-80 330 30 520-8s330-90 560-30v90c-190-50-330 6-500 24s-340-34-580 24Z',
};

/** One aurora ribbon. Each ribbon lives in its own layer so the blur is rasterized once. */
export function AuroraRibbon({ name }: { name: AuroraName }) {
  return (
    <g className={`aurora-ribbon aurora-ribbon-${name}`} filter="url(#soften-wide)" aria-hidden="true">
      <path d={AURORA_PATHS[name]} fill={`url(#aurora-${name})`} />
    </g>
  );
}

export function MountainsFar() {
  return (
    <g aria-hidden="true">
      <path
        d="m-20 470 150-150 100 98 125-168 160 182 150-118 185 154 140-182 160 178 130-118 200 134v280H-20Z"
        fill="url(#mountain-far)"
      />
      <g fill="#d6e8f2" opacity="0.8">
        <path d="M130 320l34 44-12-8-10 13-11-11-12 9-14-8Z" />
        <path d="M355 250l34 44-12-8-10 13-11-11-12 9-14-8Z" />
        <path d="M665 314l34 44-12-8-10 13-11-11-12 9-14-8Z" />
        <path d="M990 286l34 44-12-8-10 13-11-11-12 9-14-8Z" />
        <path d="M1280 346l34 44-12-8-10 13-11-11-12 9-14-8Z" />
      </g>
      <path d="m-20 470 150-150 100 98" fill="none" stroke="#9fd0e6" strokeOpacity="0.28" strokeWidth="2" />
    </g>
  );
}

const FAR_LIGHTS: readonly (readonly [number, number])[] = [
  [228, 506],
  [262, 512],
  [468, 516],
  [504, 508],
  [902, 520],
  [1230, 518],
  [1262, 524],
];

export function MountainsMid() {
  return (
    <g aria-hidden="true">
      <path
        d="m-20 528 130-112 110 86 118-74 104 90 124-128 134 118 118-82 124 94 120-114 104 86 130-60 100 68v340H-20Z"
        fill="url(#mountain-mid)"
      />
      <g fill="#ffd89a" opacity="0.8">
        {FAR_LIGHTS.map(([x, y], index) => (
          <circle key={index} className="far-light" cx={x} cy={y} r="1.8" style={{ '--delay': `${index * 0.7}s` } as CSSProperties} />
        ))}
      </g>
    </g>
  );
}

type PineProps = { x: number; base: number; height: number; width: number; fill: string; snow?: string; delay?: number };

/** A feathery pine: overlapping tiers with a scalloped lower edge and a light dusting of snow on top. */
export function Pine({ x, base, height, width, fill, snow = '#dfeaee', delay = 0 }: PineProps): ReactNode {
  const tiers = 5;
  const trunk = height * 0.1;
  const top = base - trunk - height;
  const tierHeight = height * 0.4;
  const step = (height - tierHeight) / (tiers - 1);
  const parts: ReactNode[] = [];
  for (let tier = 0; tier < tiers; tier += 1) {
    const apex = top + tier * step;
    const bottom = apex + tierHeight;
    const half = (width / 2) * (0.42 + (0.58 * tier) / (tiers - 1));
    const lobe = half / 2.5;
    parts.push(
      <path
        key={`t${tier}`}
        d={`M${x} ${apex}L${x + half} ${bottom - 3}q-${lobe} 6 -${lobe * 1.2} 1t-${lobe * 1.2} 2t-${lobe * 1.2} -2t-${lobe * 1.2} -1Z`}
        fill={fill}
      />,
      <path
        key={`s${tier}`}
        d={`M${x} ${apex}L${x + half * 0.46} ${apex + tierHeight * 0.46}q-${half * 0.18} 4 -${half * 0.46} 1.5t-${half * 0.46} -1.5Z`}
        fill={snow}
        opacity="0.55"
      />,
    );
  }
  return (
    <g className="pine" style={{ '--delay': `${delay}s` } as CSSProperties}>
      <rect x={x - width * 0.04} y={base - trunk} width={width * 0.08} height={trunk} fill="#241a1c" />
      {parts}
    </g>
  );
}

export function Gradients() {
  return (
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.12" y2="1">
        <stop stopColor="#050c24" />
        <stop offset="0.38" stopColor="#0d1f4a" />
        <stop offset="0.72" stopColor="#1b4a63" />
        <stop offset="1" stopColor="#3a7378" />
      </linearGradient>
      <radialGradient id="horizon-glow" cx="0.74" cy="0.74" r="0.5">
        <stop stopColor="#ffbf72" stopOpacity="0.34" />
        <stop offset="1" stopColor="#ffbf72" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="moon-halo">
        <stop stopColor="#e6efff" stopOpacity="0.7" />
        <stop offset="0.3" stopColor="#a9c8ff" stopOpacity="0.26" />
        <stop offset="1" stopColor="#9fc2ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="moon-face" cx="0.38" cy="0.34">
        <stop stopColor="#ffffff" />
        <stop offset="1" stopColor="#f0ecd6" />
      </radialGradient>
      <linearGradient id="aurora-teal" x2="0" y2="1">
        <stop stopColor="#a8f5d6" stopOpacity="0" />
        <stop offset="0.5" stopColor="#4de3b8" stopOpacity="0.62" />
        <stop offset="1" stopColor="#6fc4ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="aurora-violet" x2="0" y2="1">
        <stop stopColor="#d6b8ff" stopOpacity="0" />
        <stop offset="0.5" stopColor="#9a7cf0" stopOpacity="0.4" />
        <stop offset="1" stopColor="#7fd0ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="aurora-green" x2="0" y2="1">
        <stop stopColor="#d4ffb0" stopOpacity="0" />
        <stop offset="0.5" stopColor="#8df08a" stopOpacity="0.4" />
        <stop offset="1" stopColor="#5fe0c0" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="mountain-far" x2="0" y2="1">
        <stop stopColor="#2c4766" />
        <stop offset="1" stopColor="#1b3350" />
      </linearGradient>
      <linearGradient id="mountain-mid" x2="0" y2="1">
        <stop stopColor="#1b3a50" />
        <stop offset="1" stopColor="#12293b" />
      </linearGradient>
      <linearGradient id="snow-ground" x2="0" y2="1">
        <stop stopColor="#f4f1e4" />
        <stop offset="0.55" stopColor="#c9dbe0" />
        <stop offset="1" stopColor="#8fb0bd" />
      </linearGradient>
      <linearGradient id="snow-hill-back" x2="0" y2="1">
        <stop stopColor="#8fb1c2" />
        <stop offset="0.35" stopColor="#4d7288" />
        <stop offset="1" stopColor="#1f3a50" />
      </linearGradient>
      <linearGradient id="wall-shade" x2="0" y2="1">
        <stop stopColor="#fff2d0" stopOpacity="0.1" />
        <stop offset="1" stopColor="#1a1018" stopOpacity="0.42" />
      </linearGradient>
      <radialGradient id="snowman-body" cx="0.7" cy="0.35">
        <stop stopColor="#fff7e4" />
        <stop offset="0.6" stopColor="#dfeaef" />
        <stop offset="1" stopColor="#a6bfd0" />
      </radialGradient>
      <linearGradient id="roof-snow" x2="0" y2="1">
        <stop stopColor="#fbfbf3" />
        <stop offset="1" stopColor="#bfd5de" />
      </linearGradient>
      <radialGradient id="window-warm">
        <stop stopColor="#fff7c7" />
        <stop offset="0.55" stopColor="#ffc56d" />
        <stop offset="1" stopColor="#e4893d" />
      </radialGradient>
      <radialGradient id="window-halo">
        <stop stopColor="#ffcf7a" stopOpacity="0.62" />
        <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="bulb-halo">
        <stop stopColor="#ffffff" stopOpacity="0.9" />
        <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="smoke-puff" cx="0.5" cy="0.5" r="0.5">
        <stop stopColor="#d8e0e6" stopOpacity="0.62" />
        <stop offset="1" stopColor="#d8e0e6" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lamp-cone" x2="0" y2="1">
        <stop stopColor="#ffd488" stopOpacity="0.36" />
        <stop offset="1" stopColor="#ffd488" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="mist" x2="1" y2="0">
        <stop stopColor="#bcd7e6" stopOpacity="0" />
        <stop offset="0.5" stopColor="#bcd7e6" stopOpacity="0.2" />
        <stop offset="1" stopColor="#bcd7e6" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.45" stopColor="#050b1c" stopOpacity="0" />
        <stop offset="1" stopColor="#050b1c" stopOpacity="0.72" />
      </radialGradient>
      <linearGradient id="trail" x1="1" x2="0">
        <stop stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <filter id="soften-wide" x="-20%" y="-40%" width="140%" height="180%">
        <feGaussianBlur stdDeviation="20" />
      </filter>
    </defs>
  );
}
