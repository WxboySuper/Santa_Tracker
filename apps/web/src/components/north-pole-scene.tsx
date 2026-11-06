'use client';

import { useRef, useState } from 'react';

type SceneLabels = { label: string; stoke: string; lampOn: string; lampOff: string; tree: string };

function CabinWindow({ label }: { label: string }) {
  return (
    <svg className="cabin-window" viewBox="0 0 860 570" role="img" aria-label={label}>
      <defs>
        <linearGradient id="cabin-sky" x2="0" y2="1">
          <stop stopColor="#10213d" />
          <stop offset="1" stopColor="#253d57" />
        </linearGradient>
        <linearGradient id="aurora" x2="1" y2=".2">
          <stop stopColor="#6ee7b7" stopOpacity="0" />
          <stop offset=".5" stopColor="#77d9c2" stopOpacity=".42" />
          <stop offset="1" stopColor="#a6e6cc" stopOpacity="0" />
        </linearGradient>
        <filter id="window-glow">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <rect width="860" height="570" fill="url(#cabin-sky)" />
      <path
        className="cabin-aurora"
        d="M0 142 Q185 8 370 111 T860 66 L860 220 Q640 147 442 232 T0 244Z"
        fill="url(#aurora)"
      />
      <g fill="#fff4d5" opacity=".9">
        <circle cx="88" cy="73" r="2" />
        <circle cx="214" cy="128" r="2" />
        <circle cx="323" cy="53" r="1.8" />
        <circle cx="524" cy="87" r="2" />
        <circle cx="704" cy="56" r="2" />
        <circle cx="800" cy="143" r="1.8" />
        <circle cx="426" cy="156" r="1.5" />
        <circle cx="157" cy="202" r="1.5" />
      </g>
      <path
        d="M0 363 104 272l85 66 105-129 114 145 108-111 98 126 110-138 136 130v209H0Z"
        fill="#243a50"
      />
      <g fill="#35464c">
        <path d="m92 371 68-97 69 97v124H92z" />
        <path d="m254 389 79-116 81 116v106H254z" />
        <path d="m577 382 72-101 75 101v115H577z" />
        <path d="m720 395 65-91 67 91v102h-132z" />
      </g>
      <g fill="#f6c979" filter="url(#window-glow)" opacity=".8">
        <rect x="124" y="352" width="26" height="32" />
        <rect x="307" y="353" width="25" height="30" />
        <rect x="613" y="351" width="27" height="30" />
        <rect x="759" y="354" width="26" height="29" />
      </g>
      <g fill="#f6c979">
        <rect x="124" y="352" width="26" height="32" />
        <rect x="307" y="353" width="25" height="30" />
        <rect x="613" y="351" width="27" height="30" />
        <rect x="759" y="354" width="26" height="29" />
      </g>
      <path d="M0 450q130-34 258 0t255 1 213-4 134 3v120H0Z" fill="#e7eef0" />
      <g className="window-flakes" fill="#f7fbfc">
        <circle cx="94" cy="299" r="4" />
        <circle cx="216" cy="235" r="3" />
        <circle cx="386" cy="310" r="4" />
        <circle cx="512" cy="256" r="3" />
        <circle cx="690" cy="298" r="4" />
        <circle cx="800" cy="238" r="3" />
      </g>
      <rect
        className="window-pane"
        x="25"
        y="24"
        width="810"
        height="522"
        rx="16"
        fill="none"
        stroke="#d7c5a1"
        strokeWidth="20"
      />
      <path d="M430 24v522M25 284h810" stroke="#c8b48f" strokeWidth="14" />
      <rect
        x="34"
        y="34"
        width="792"
        height="502"
        rx="10"
        fill="none"
        stroke="#fff"
        strokeOpacity=".16"
        strokeWidth="3"
      />
    </svg>
  );
}

function CabinSill() {
  return (
    <div className="cabin-sill" aria-hidden="true">
      <span className="sill-mug">
        <i />
        <b />
      </span>
      <span className="sill-steam sill-steam--one" />
      <span className="sill-steam sill-steam--two" />
      <span className="sill-candle" />
    </div>
  );
}

function CabinFireplace({
  stoked,
  onStoke,
  label,
}: {
  stoked: boolean;
  onStoke: () => void;
  label: string;
}) {
  return (
    <aside className="cabin-fireplace" aria-label={label}>
      <div className="fire-mantel" />
      <div className={`firebox${stoked ? ' firebox--stoked' : ''}`}>
        <button className="fire-button" type="button" aria-label={label} onClick={onStoke}>
          <span className="fire-log" />
          <span className="flame flame--one" />
          <span className="flame flame--two" />
          <span className="flame flame--three" />
        </button>
      </div>
      <div className="fire-hearth" />
      <span className="stocking stocking--one" aria-hidden="true" />
      <span className="stocking stocking--two" aria-hidden="true" />
    </aside>
  );
}

function CabinTree({
  palette,
  label,
  onCycle,
}: {
  palette: number;
  label: string;
  onCycle: () => void;
}) {
  return (
    <button
      className={`cabin-tree cabin-tree--palette-${palette}`}
      type="button"
      aria-label={label}
      onClick={onCycle}
    >
      <span className="tree-star" aria-hidden="true">
        {'✦'}
      </span>
      <span className="tree-layer tree-layer--one" />
      <span className="tree-layer tree-layer--two" />
      <span className="tree-layer tree-layer--three" />
      <span className="tree-trunk" />
      <i className="tree-light light-one" />
      <i className="tree-light light-two" />
      <i className="tree-light light-three" />
      <i className="tree-light light-four" />
      <i className="tree-light light-five" />
    </button>
  );
}

function SillWindow({ label }: { label: string }) {
  return (
    <div className="cabin-window-wrap">
      <CabinWindow label={label} />
      <CabinSill />
    </div>
  );
}

export default function NorthPoleScene({ labels }: { labels: SceneLabels }) {
  const [bright, setBright] = useState(true);
  const [palette, setPalette] = useState(0);
  const [stoked, setStoked] = useState(false);
  const lastStokedAt = useRef(0);

  function stokeFire() {
    const now = Date.now();
    if (now - lastStokedAt.current < 1_500) return;
    lastStokedAt.current = now;
    setStoked(true);
    window.setTimeout(() => setStoked(false), 900);
  }

  return (
    <section aria-label={labels.label} className={`cabin-room${bright ? '' : ' cabin-room--dim'}`}>
      <div className="cabin-wall">
        <div className="cabin-rafters" aria-hidden="true" />
        <SillWindow label={labels.label} />
        <CabinFireplace stoked={stoked} onStoke={stokeFire} label={labels.stoke} />
        <CabinTree
          palette={palette}
          label={labels.tree}
          onCycle={() => setPalette((palette + 1) % 3)}
        />
        <button
          className="lamp-toggle"
          type="button"
          aria-pressed={!bright}
          aria-label={bright ? labels.lampOff : labels.lampOn}
          onClick={() => setBright(!bright)}
        >
          <span aria-hidden="true">{'◉'}</span>
        </button>
      </div>
    </section>
  );
}
