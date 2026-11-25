/** A small storybook sleigh with one reindeer, drawn facing east; the west-facing copy is mirrored. */
const SLEIGH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="30" viewBox="0 0 64 30">
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M31 13 L45 14" stroke="#d4a017" stroke-width="1.1" fill="none"/>
<path d="M44 13.5 q5 -3.5 10 0 l1 5 M47 15 l-1.5 5.5 M52 15 l1.5 5.5" stroke="#6b3f22" stroke-width="1.8" fill="none"/>
<ellipse cx="49.5" cy="14" rx="6" ry="3.2" fill="#7a4b2a"/>
<path d="M54 12 l3.5 -4" stroke="#7a4b2a" stroke-width="2.4"/>
<circle cx="58" cy="7.6" r="2" fill="#7a4b2a"/>
<circle cx="59.9" cy="8" r="1" fill="#ef4444"/>
<path d="M57 6 l-1.5 -3.5 M57.2 5.2 l1.8 -3 M56 3.6 l-1.8 -0.6" stroke="#8b6b4a" stroke-width="0.9" fill="none"/>
<circle cx="11" cy="8.5" r="3.2" fill="#c81e1e"/>
<circle cx="11" cy="4.6" r="1.9" fill="#f3d6b8"/>
<path d="M9.2 4 q1.8 -3.2 3.8 0 z" fill="#c81e1e"/>
<circle cx="5.5" cy="10" r="3.4" fill="#8b5a2b"/>
<path d="M3 13 h20 q4 0 5.5 -4.5 l0.8 -2.5 h3 l-1.8 7 q-2 6.5 -9 6.5 h-15.5 q-3 0 -3 -3 z" fill="#b91c1c" stroke="#5a1010" stroke-width="0.9"/>
<path d="M4 15.5 h18" stroke="#e8b931" stroke-width="0.9"/>
<path d="M1.5 24.5 h25 q4 0 6 -3.5" stroke="#d4a017" stroke-width="1.6" fill="none"/>
<path d="M8 20 v4.5 M20 20 v4.5" stroke="#d4a017" stroke-width="1.2"/>
</g></svg>`;

function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const SLEIGH_EAST = dataUrl(SLEIGH_SVG);
export const SLEIGH_WEST = dataUrl(SLEIGH_SVG.replace('<g ', '<g transform="translate(64 0) scale(-1 1)" '));

/** True when a bearing in radians (clockwise from north, as `bearingBetween` returns) points into the western half. */
export function headingWest(bearingRadians: number): boolean {
  return Math.sin(bearingRadians) < 0;
}
