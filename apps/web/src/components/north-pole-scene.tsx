"use client";

import { useEffect, useState } from 'react';

const colours = [
  { name: 'warm white', fill: '#fff3cf' },
  { name: 'amber', fill: '#ffc56f' },
  { name: 'soft red', fill: '#f18c82' },
  { name: 'pine', fill: '#a5d4ac' },
  { name: 'ice blue', fill: '#a9d8f2' },
];
const bulbs = [110, 226, 342, 458, 574, 690, 806, 922, 1038, 1154];
const snow: [number, number, number][] = [
  [68, 24, 1.7], [186, 4, 1.4], [274, 42, 1.8], [392, 16, 1.3],
  [510, 30, 1.5], [623, 5, 1.6], [744, 39, 1.4], [851, 18, 1.8],
  [966, 48, 1.5], [1073, 12, 1.4], [1183, 33, 1.7], [328, 7, 1.3],
];

export default function NorthPoleScene({ label }: { label: string }) {
  const [chosen, setChosen] = useState<number[]>(bulbs.map((_, index) => index % colours.length));
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const cycle = (index: number) => {
    setChosen((current) => current.map((value, item) => item === index ? (value + 1) % colours.length : value));
  };

  return (
    <svg className={`north-pole-scene${visible ? ' is-visible' : ''}`} viewBox="0 0 1264 112" role="group" aria-label={label} xmlns="http://www.w3.org/2000/svg">
      <path className="light-wire" d="M-24 10 Q316 112 632 74 T1288 10" />
      <g aria-hidden="true">
        {snow.map(([x, y, radius], index) => (
          <circle key={index} className={`snowfall-particle snowfall-${index % 4}`} cx={x} cy={y} r={radius} />
        ))}
      </g>
      {bulbs.map((x, index) => {
        const y = 10 + 78 * (1 - Math.pow((x - 632) / 656, 2));
        const colour = colours[chosen[index] ?? 0] ?? colours[0]!;
        return (
          <g key={x} className={`light-bulb light-bulb-${index % 4}`} role="button" tabIndex={0}
            aria-label={`Light ${index + 1}, ${colour.name}. Activate to change colour.`} aria-pressed="true"
            onClick={() => cycle(index)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cycle(index); }
            }}>
            <circle cx={x} cy={y + 9} r="3" fill="#d6c59b" />
            <circle className="bulb-halo" cx={x} cy={y + 20} r="12" fill={colour.fill} />
            <circle cx={x} cy={y + 20} r="4.5" fill={colour.fill} />
          </g>
        );
      })}
    </svg>
  );
}
