'use client';

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Pine } from './scene-art';

export const TREE_PALETTES = [
  ['#ffd58a', '#fff0c4', '#ffb25c'],
  ['#ff6b6b', '#ffd166', '#5ec8f2', '#7be0a0'],
  ['#d6ecff', '#9ccfff', '#f2f8ff'],
] as const;

export type VillageControls = {
  lit: ReadonlySet<number>;
  onToggleWindow: (index: number) => void;
  windowLabel: (index: number, lit: boolean) => string;
  treePalette: number;
  onCycleTree: () => void;
  treeLabel: string;
};

type WindowSpec = { index: number; dx: number; dy: number; w?: number; h?: number };

type HouseSpec = {
  x: number;
  base: number;
  w: number;
  h: number;
  roof: number;
  wall: string;
  chimneyDx: number;
  windows: WindowSpec[];
  door?: number;
  puffDelay: number;
};

const HOUSES: HouseSpec[] = [
  { x: 800, base: 616, w: 104, h: 84, roof: 58, wall: '#7b5546', chimneyDx: 76, door: 40, puffDelay: 0, windows: [{ index: 0, dx: 14, dy: 26 }, { index: 1, dx: 64, dy: 26 }] },
  { x: 1034, base: 612, w: 100, h: 112, roof: 64, wall: '#6a4942', chimneyDx: 14, door: 38, puffDelay: 2.4, windows: [{ index: 2, dx: 14, dy: 24 }, { index: 3, dx: 62, dy: 24 }, { index: 4, dx: 38, dy: 64, w: 22 }] },
  { x: 1156, base: 618, w: 96, h: 92, roof: 56, wall: '#80594a', chimneyDx: 68, door: 36, puffDelay: 4.1, windows: [{ index: 5, dx: 12, dy: 28 }, { index: 6, dx: 60, dy: 28 }] },
  { x: 1274, base: 626, w: 112, h: 100, roof: 66, wall: '#6f4c44', chimneyDx: 20, door: 46, puffDelay: 1.3, windows: [{ index: 7, dx: 16, dy: 28 }, { index: 8, dx: 70, dy: 28 }] },
];

export const WINDOW_COUNT = 9;

function activateOnKey(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function Smoke({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g className="smoke" aria-hidden="true">
      {[0, 1, 2].map((puff) => (
        <circle
          key={puff}
          className="smoke-puff"
          cx={x}
          cy={y}
          r={5 + puff * 1.6}
          fill="url(#smoke-puff)"
          style={{ '--delay': `${delay + puff * 2.3}s`, '--drift': `${18 + puff * 9}px` } as CSSProperties}
        />
      ))}
    </g>
  );
}

function SceneWindow({ spec, house, controls }: { spec: WindowSpec; house: HouseSpec; controls: VillageControls }) {
  const w = spec.w ?? 20;
  const h = spec.h ?? 24;
  const x = house.x + spec.dx;
  const y = house.base - house.h + spec.dy;
  const lit = controls.lit.has(spec.index);
  const activate = () => controls.onToggleWindow(spec.index);
  return (
    <g
      className={`village-window${lit ? ' is-lit' : ''}${spec.index % 3 === 0 ? ' window-flicker' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={lit}
      aria-label={controls.windowLabel(spec.index + 1, lit)}
      onClick={activate}
      onKeyDown={(event) => activateOnKey(event, activate)}
      style={{ '--delay': `${(spec.index % 5) * 0.9}s` } as CSSProperties}
    >
      <circle className="window-halo" cx={x + w / 2} cy={y + h / 2} r="38" fill="url(#window-halo)" />
      <rect className="window-glass" x={x} y={y} width={w} height={h} rx="2" />
      <path className="window-mullion" d={`M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}`} />
      <rect x={x - 3} y={y + h} width={w + 6} height="4" rx="2" fill="#e8f1f2" opacity="0.9" />
      <rect className="window-focus" x={x - 9} y={y - 8} width={w + 18} height={h + 20} rx="8" />
    </g>
  );
}

function Icicles({ x1, x2, y, seed }: { x1: number; x2: number; y: number; seed: number }) {
  const parts: string[] = [];
  for (let px = x1 + 6; px < x2 - 6; px += 9) {
    const length = 4 + ((px * seed) % 7);
    parts.push(`M${px} ${y}l2.2 ${length} 2.2 -${length}Z`);
  }
  return <path d={parts.join('')} fill="#eaf7ff" opacity="0.78" />;
}

type CapGeometry = { apexX: number; apexY: number; wallTop: number; left: number; right: number };

/** The snow lying on a gable: the upper 80% of the roof with a scalloped lower edge. */
function snowCap({ apexX, apexY, wallTop, left, right }: CapGeometry): string {
  const reach = 0.8;
  const leftX = apexX + (left - apexX) * reach;
  const rightX = apexX + (right - apexX) * reach;
  const y = apexY + (wallTop - apexY) * reach;
  const scallops = 5;
  const segment = (rightX - leftX) / scallops;
  let path = `M${apexX} ${apexY - 3}L${rightX} ${y}`;
  for (let index = 0; index < scallops; index += 1) {
    const fromX = rightX - index * segment;
    path += `Q${fromX - segment / 2} ${y + 11} ${fromX - segment} ${y}`;
  }
  return `${path}Z`;
}

function House({ spec, controls }: { spec: HouseSpec; controls: VillageControls }) {
  const { x, base, w, h, roof } = spec;
  const wallTop = base - h;
  const left = x - 12;
  const right = x + w + 12;
  const apexX = x + w / 2;
  const apexY = wallTop - roof;
  const chimneyX = x + spec.chimneyDx;
  const chimneyTop = apexY + roof * 0.34;
  return (
    <g className="house">
      <ellipse cx={x + w / 2} cy={base + 4} rx={w * 0.7} ry="7" fill="#0b1626" opacity="0.38" />
      <rect x={x} y={wallTop} width={w} height={h} fill={spec.wall} />
      <rect x={x} y={wallTop} width={w} height={h} fill="url(#wall-shade)" />
      <path d={`M${x} ${wallTop + 10}h${w}M${x} ${wallTop + 26}h${w}M${x} ${wallTop + 42}h${w}M${x} ${wallTop + 58}h${w}M${x} ${wallTop + 74}h${w}`} stroke="#2c1f20" strokeOpacity="0.22" strokeWidth="1" />
      <rect x={chimneyX} y={chimneyTop} width="14" height={apexY + roof * 0.7 - chimneyTop + 10} fill="#664b43" />
      <path d={`M${chimneyX - 2} ${chimneyTop}h18l-2 -6h-14Z`} fill="url(#roof-snow)" />
      <Smoke x={chimneyX + 7} y={chimneyTop - 8} delay={spec.puffDelay} />
      <path d={`M${left} ${wallTop}L${apexX} ${apexY}L${right} ${wallTop}Z`} fill="#26434c" />
      <path d={`M${left} ${wallTop}L${apexX} ${apexY}L${right} ${wallTop}`} fill="none" stroke="#3a5e68" strokeWidth="3" strokeLinejoin="round" />
      <path d={snowCap({ apexX, apexY, wallTop, left, right })} fill="url(#roof-snow)" />
      <path d={`M${left - 3} ${wallTop + 2}Q${apexX} ${wallTop + 14} ${right + 3} ${wallTop + 2}`} fill="none" stroke="#f2f6f2" strokeWidth="6" strokeLinecap="round" />
      <Icicles x1={left} x2={right} y={wallTop + 6} seed={spec.puffDelay * 7 + 3} />
      {spec.door !== undefined && (
        <g aria-hidden="true">
          <path d={`M${x + spec.door} ${base}v-30q10 -16 20 0v30Z`} fill="#2b2023" />
          <path className="door-glow" d={`M${x + spec.door + 4} ${base}v-26q6 -11 12 0v26Z`} fill="#ffb95e" opacity="0.5" />
          <circle className="porch-lamp" cx={x + spec.door + 26} cy={base - 38} r="2.6" fill="#ffe3a0" />
        </g>
      )}
      {spec.windows.map((window) => (
        <SceneWindow key={window.index} spec={window} house={spec} controls={controls} />
      ))}
      <path d={`M${x - 14} ${base + 2}q${w * 0.25} -14 ${w * 0.55} -6t${w * 0.5} 6Z`} fill="#eaf2f0" opacity="0.95" />
    </g>
  );
}

function Church() {
  return (
    <g className="church" aria-hidden="true" transform="translate(1100 0)">
      <rect x="0" y="498" width="44" height="64" fill="#53423f" />
      <path d="M-6 498L22 466L50 498Z" fill="#26434c" />
      <path d="M-6 498L22 466L50 498" fill="none" stroke="#e4eef0" strokeWidth="3" opacity="0.8" />
      <rect x="14" y="440" width="16" height="30" fill="#5b4845" />
      <path d="M10 440L22 410L34 440Z" fill="#26434c" />
      <path d="M22 410v-12m-5 5h10" stroke="#ffd88a" strokeWidth="1.6" />
      <circle className="church-window" cx="22" cy="518" r="7" fill="url(#window-warm)" />
      <rect x="17" y="536" width="10" height="26" rx="5" fill="#ffc56d" opacity="0.7" />
    </g>
  );
}

function LampPost({ x, base, delay }: { x: number; base: number; delay: number }) {
  return (
    <g className="lamp" aria-hidden="true" style={{ '--delay': `${delay}s` } as CSSProperties}>
      <path d={`M${x - 36} ${base}L${x + 36} ${base}L${x + 14} ${base - 104}L${x - 14} ${base - 104}Z`} fill="url(#lamp-cone)" />
      <rect x={x - 2} y={base - 108} width="4" height="108" fill="#1c1a24" />
      <rect x={x - 6} y={base - 120} width="12" height="14" rx="2" fill="#2a2630" />
      <circle className="lamp-glow" cx={x} cy={base - 113} r="22" fill="url(#window-halo)" />
      <rect x={x - 4} y={base - 118} width="8" height="10" rx="1.5" fill="#ffe7ac" />
    </g>
  );
}

function Presents() {
  return (
    <g aria-hidden="true">
      <g transform="translate(912 622)">
        <rect width="20" height="16" rx="1.5" fill="#b8423f" />
        <path d="M10 0v16M0 7h20" stroke="#f3d78c" strokeWidth="2.4" />
        <path d="M10 0q-7 -8 -9 -2t9 2q7 -8 9 -2t-9 2" fill="none" stroke="#f3d78c" strokeWidth="1.6" />
      </g>
      <g transform="translate(990 626)">
        <rect width="17" height="13" rx="1.5" fill="#3b7dc4" />
        <path d="M8.5 0v13M0 6h17" stroke="#f6efe0" strokeWidth="2.2" />
      </g>
      <g transform="translate(1004 630)">
        <rect width="12" height="9" rx="1.5" fill="#2f8f6a" />
        <path d="M6 0v9M0 4h12" stroke="#f3d78c" strokeWidth="1.8" />
      </g>
    </g>
  );
}

function Footprints() {
  const prints: [number, number][] = [
    [1076, 640],
    [1062, 646],
    [1048, 641],
    [1034, 647],
    [1020, 643],
    [1008, 650],
    [880, 648],
    [868, 654],
    [854, 650],
  ];
  return (
    <g fill="#8aa7b8" opacity="0.5" aria-hidden="true">
      {prints.map(([x, y], index) => (
        <ellipse key={index} cx={x} cy={y} rx="3.2" ry="1.6" transform={`rotate(${index % 2 ? -12 : 10} ${x} ${y})`} />
      ))}
    </g>
  );
}

function bulbPoints(from: [number, number], to: [number, number], sag: number, count: number): [number, number][] {
  const control: [number, number] = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + sag];
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / (count + 1);
    const inverse = 1 - t;
    return [
      inverse * inverse * from[0] + 2 * inverse * t * control[0] + t * t * to[0],
      inverse * inverse * from[1] + 2 * inverse * t * control[1] + t * t * to[1],
    ];
  });
}

const STRINGS: { from: [number, number]; to: [number, number]; sag: number; count: number }[] = [
  { from: [1058, 548], to: [1196, 562], sag: 40, count: 6 },
  { from: [1196, 562], to: [1318, 560], sag: 36, count: 5 },
];

const BULB_COLORS = ['#ff6b6b', '#ffd166', '#5ec8f2', '#7be0a0', '#ffb25c'];

function StringLights() {
  return (
    <g className="string-lights" aria-hidden="true">
      {STRINGS.map((line, stringIndex) => {
        const control = `${(line.from[0] + line.to[0]) / 2} ${Math.max(line.from[1], line.to[1]) + line.sag * 2}`;
        return (
          <g key={stringIndex}>
            <path d={`M${line.from[0]} ${line.from[1]}Q${control} ${line.to[0]} ${line.to[1]}`} fill="none" stroke="#1d1a22" strokeWidth="1.4" />
            {bulbPoints(line.from, line.to, line.sag, line.count).map(([bx, by], bulb) => {
              const color = BULB_COLORS[(bulb + stringIndex * 2) % BULB_COLORS.length];
              return (
                <g key={bulb} className="bulb" style={{ '--delay': `${((bulb * 7 + stringIndex * 3) % 11) * 0.31}s` } as CSSProperties}>
                  <circle cx={bx} cy={by + 4} r="7" fill={color} opacity="0.3" />
                  <circle cx={bx} cy={by + 4} r="3.2" fill={color} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function ChristmasTree({ controls }: { controls: VillageControls }) {
  const palette = TREE_PALETTES[controls.treePalette % TREE_PALETTES.length] ?? TREE_PALETTES[0];
  const tiers = [
    { y: 560, half: 58, drop: 60 },
    { y: 520, half: 48, drop: 54 },
    { y: 482, half: 38, drop: 48 },
    { y: 448, half: 27, drop: 42 },
  ];
  const bulbs: [number, number][] = [
    [930, 600],
    [962, 614],
    [992, 596],
    [948, 566],
    [978, 572],
    [940, 538],
    [968, 540],
    [958, 504],
    [974, 516],
    [962, 468],
    [950, 488],
    [972, 482],
  ];
  return (
    <g
      className="tree"
      role="button"
      tabIndex={0}
      aria-label={controls.treeLabel}
      onClick={controls.onCycleTree}
      onKeyDown={(event) => activateOnKey(event, controls.onCycleTree)}
    >
      <ellipse cx="960" cy="640" rx="64" ry="9" fill="#0b1626" opacity="0.4" />
      <rect x="954" y="618" width="12" height="22" fill="#4a3228" />
      {tiers.map((tier, index) => (
        <g key={index}>
          <path d={`M960 ${tier.y - tier.drop}L${960 + tier.half} ${tier.y + 12}Q960 ${tier.y + 20} ${960 - tier.half} ${tier.y + 12}Z`} fill={index % 2 ? '#1f5a43' : '#1b4f3c'} />
          <path
            d={`M960 ${tier.y - tier.drop}L${960 + tier.half * 0.55} ${tier.y - tier.drop * 0.25}q-${tier.half * 0.16} 8 -${tier.half * 0.3} 3t-${tier.half * 0.28} 5t-${tier.half * 0.3} -3Z`}
            fill="#e5f0f0"
            opacity="0.85"
          />
        </g>
      ))}
      <path d="M918 594q42 24 86 0M934 556q27 18 54 0M944 520q17 12 34 0" fill="none" stroke="#e8c27a" strokeWidth="1.8" opacity="0.8" />
      {bulbs.map(([bx, by], index) => {
        const color = palette[index % palette.length] ?? '#ffd58a';
        return (
          <g key={index} className="tree-bulb" style={{ '--delay': `${(index * 0.37) % 3.1}s` } as CSSProperties}>
            <circle cx={bx} cy={by} r="6" fill={color} opacity="0.28" />
            <circle cx={bx} cy={by} r="3" fill={color} />
          </g>
        );
      })}
      <g className="tree-star">
        <circle cx="960" cy="406" r="22" fill="url(#window-halo)" />
        <path d="M960 394l3.6 9.4 10 .5-7.8 6.2 2.6 9.7-8.4-5.5-8.4 5.5 2.6-9.7-7.8-6.2 10-.5Z" fill="#ffe6a0" />
      </g>
      <rect className="tree-focus" x="896" y="392" width="128" height="256" rx="16" fill="transparent" />
    </g>
  );
}

function Snowman() {
  return (
    <g className="snowman" aria-hidden="true">
      <ellipse cx="1404" cy="706" rx="46" ry="8" fill="#12263a" opacity="0.35" />
      <circle cx="1404" cy="676" r="30" fill="url(#snowman-body)" />
      <circle cx="1404" cy="636" r="22" fill="url(#snowman-body)" />
      <circle cx="1404" cy="602" r="16" fill="url(#snowman-body)" />
      <path d="M1383 592h42v-6h-8l-4-22h-18l-4 22h-8Z" fill="#241d2b" />
      <path d="M1389 586h30" stroke="#c9453d" strokeWidth="4" />
      <circle cx="1398" cy="601" r="1.8" fill="#1a1a22" />
      <circle cx="1411" cy="601" r="1.8" fill="#1a1a22" />
      <path d="M1404 605l12 3-12 2Z" fill="#f08a3c" />
      <g className="snowman-scarf">
        <path d="M1388 613q16 9 32 0l1 7q-17 9 -34 0Z" fill="#c9453d" />
        <path d="M1414 618l9 22 6 -2 -4 -22Z" fill="#b13a35" />
      </g>
      <path d="M1376 640l-24 -14m24 14l-6 -22m-12 8l8 -6" stroke="#4a3228" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M1432 640l24 -16" stroke="#4a3228" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="1404" cy="628" r="1.8" fill="#1a1a22" />
      <circle cx="1404" cy="642" r="1.8" fill="#1a1a22" />
    </g>
  );
}

export function Sleigh() {
  return (
    <g className="sleigh" aria-hidden="true">
      <path className="sleigh-trail" d="M-250 7q80 -9 190 -3l8 6q-110 6 -198 -3Z" fill="url(#trail)" />
      <circle cx="-30" cy="2" r="42" fill="url(#bulb-halo)" opacity="0.26" />
      <g transform="scale(-1 1)" fill="#2b1f46" stroke="#ffe3ac" strokeWidth="0.9" strokeOpacity="0.9">
        <path d="M-18 -4h34q9 0 9 8t-9 8h-38q-5 -10 4 -16Z" />
        <circle cx="-4" cy="-11" r="5.5" />
        <path d="M-32 9q-9 0 -9 6 16 0 40 0" fill="none" />
        <path d="M-74 -3l9 -4 7 6-3 6 7 6-18 0-4 -6Z" />
        <path d="M-102 -3l9 -4 7 6-3 6 7 6-18 0-4 -6Z" />
        <path d="M-130 -3l9 -4 7 6-3 6 7 6-18 0-4 -6Z" />
        <path d="M-62 5h44M-90 5h28M-118 5h28" fill="none" />
        <path d="M-68 -7l-4 -9M-65 -7l2 -10M-96 -7l-4 -9M-93 -7l2 -10M-124 -7l-4 -9M-121 -7l2 -10" fill="none" />
      </g>
      <circle cx="136" cy="4" r="3" fill="#ff4c4c" />
      <circle cx="136" cy="4" r="10" fill="url(#bulb-halo)" opacity="0.55" />
    </g>
  );
}

export function VillageLayer({ controls }: { controls: VillageControls }): ReactNode {
  return (
    <g>
      <path
        aria-hidden="true"
        d="M-100 650C200 622 500 642 800 606S1200 598 1540 614V1100H-100Z"
        fill="url(#snow-hill-back)"
      />
      <path aria-hidden="true" d="M-100 650C200 622 500 642 800 606S1200 598 1540 614" fill="none" stroke="#e8f3f6" strokeOpacity="0.5" strokeWidth="3" />
      <g transform="translate(1400 650) scale(1.1) translate(-1400 -650)">
      <Church />
      {HOUSES.map((spec) => (
        <House key={spec.x} spec={spec} controls={controls} />
      ))}
      <StringLights />
      <ChristmasTree controls={controls} />
      <Presents />
      <Footprints />
      <LampPost x={908} base={646} delay={0} />
      <LampPost x={1016} base={642} delay={1.7} />
      </g>
    </g>
  );
}

type PineSpec = readonly [x: number, base: number, height: number, width: number, delay: number];

const BACK_PINES: readonly PineSpec[] = [
  [60, 612, 190, 78, 0.2],
  [150, 604, 150, 62, 1.4],
  [236, 612, 210, 84, 2.2],
  [340, 606, 160, 66, 0.8],
  [430, 614, 190, 74, 1.9],
  [520, 608, 170, 68, 2.7],
  [616, 616, 200, 80, 0.5],
  [720, 612, 160, 66, 1.2],
];

const FRONT_PINES: readonly PineSpec[] = [
  [-10, 706, 330, 140, 0.3],
  [120, 724, 260, 112, 1.6],
  [250, 716, 300, 126, 2.4],
  [420, 730, 220, 96, 1.1],
  [1330, 724, 250, 108, 0.9],
  [1456, 706, 330, 140, 2],
];

const GLINTS: readonly (readonly [number, number])[] = [
  [180, 722],
  [420, 760],
  [690, 736],
  [900, 772],
  [1120, 730],
  [1290, 764],
  [1500, 740],
];

export function ForestBack() {
  return (
    <g aria-hidden="true">
      {BACK_PINES.map(([x, base, height, width, delay]) => (
        <Pine key={x} x={x} base={base} height={height} width={width} fill="#113035" delay={delay} />
      ))}
    </g>
  );
}

export function ForestFront() {
  return (
    <g aria-hidden="true">
      {FRONT_PINES.map(([x, base, height, width, delay]) => (
        <Pine key={x} x={x} base={base} height={height} width={width} fill="#0b2229" snow="#c5d7de" delay={delay} />
      ))}
    </g>
  );
}

export function Foreground() {
  return (
    <g aria-hidden="true">
      <path d="M-40 690q180-52 360-10t340 4 330-20 330 14 340-14v200H-40Z" fill="url(#snow-ground)" />
      <path d="M-40 744q200-44 400-6t360 2 340-14 360 8" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" />
      <path d="M-40 790q260-30 520-4t480-10 520 6v90H-40Z" fill="#a9c4d0" opacity="0.5" />
      <g fill="#fff">
        {GLINTS.map(([x, y], index) => (
          <path
            key={index}
            className="snow-glint"
            d={`M${x} ${y - 5}l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4Z`}
            style={{ '--delay': `${index * 1.15}s` } as CSSProperties}
          />
        ))}
      </g>
      <Snowman />
    </g>
  );
}
