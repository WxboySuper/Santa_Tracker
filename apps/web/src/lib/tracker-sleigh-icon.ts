import type { MarkerPalette } from "./tracker-theme";

/** A small sleigh with one reindeer, drawn facing east in a 64x30 box. */
function sleighSvg({ body, runner, deer }: Pick<MarkerPalette, "body" | "runner" | "deer">): string {
  return `<g stroke-linecap="round" stroke-linejoin="round">
<path d="M31 13 L45 14" stroke="${runner}" stroke-width="1.1" fill="none"/>
<path d="M47 15 l-1.5 5.5 M52 15 l1.5 5.5" stroke="${deer}" stroke-width="1.8" fill="none"/>
<ellipse cx="49.5" cy="14" rx="6" ry="3.2" fill="${deer}"/>
<path d="M54 12 l3.5 -4" stroke="${deer}" stroke-width="2.4"/>
<circle cx="58" cy="7.6" r="2" fill="${deer}"/>
<circle cx="59.9" cy="8" r="1" fill="#ef4444"/>
<path d="M57 6 l-1.5 -3.5 M57.2 5.2 l1.8 -3" stroke="${deer}" stroke-width="0.9" fill="none"/>
<circle cx="11" cy="8.5" r="3.2" fill="${body}"/>
<circle cx="11" cy="4.6" r="1.9" fill="#f3d6b8"/>
<circle cx="5.5" cy="10" r="3.4" fill="#8b5a2b"/>
<path d="M3 13 h20 q4 0 5.5 -4.5 l0.8 -2.5 h3 l-1.8 7 q-2 6.5 -9 6.5 h-15.5 q-3 0 -3 -3 z" fill="${body}"/>
<path d="M1.5 24.5 h25 q4 0 6 -3.5" stroke="${runner}" stroke-width="1.6" fill="none"/>
<path d="M8 20 v4.5 M20 20 v4.5" stroke="${runner}" stroke-width="1.2"/>
</g>`;
}

/** The same sleigh as crisp pixel art (the Christmas jumper theme). */
function pixelSleighSvg({ body, runner, deer }: Pick<MarkerPalette, "body" | "runner" | "deer">): string {
  const px = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x * 2}" y="${y * 2}" width="${w * 2}" height="${h * 2}" fill="${fill}"/>`;
  return `<g shape-rendering="crispEdges" transform="translate(0 0)">
${px(1, 6, 11, 5, "#2d1414")}${px(2, 7, 9, 3, body)}${px(3, 2, 4, 4, body)}${px(4, 1, 2, 1, "#f3d6b8")}${px(4, 0, 2, 1, body)}
${px(0, 12, 14, 1, runner)}${px(13, 11, 1, 1, runner)}${px(2, 11, 1, 1, runner)}${px(9, 11, 1, 1, runner)}
${px(12, 7, 6, 1, runner)}${px(18, 6, 6, 3, deer)}${px(22, 3, 2, 3, deer)}${px(24, 3, 1, 1, "#ef4444")}${px(21, 1, 1, 2, deer)}${px(23, 1, 1, 2, deer)}
${px(18, 9, 1, 3, deer)}${px(23, 9, 1, 3, deer)}
</g>`;
}

function dataUrl(inner: string, flipped: boolean): string {
  const g = flipped ? `<g transform="translate(64 0) scale(-1 1)">${inner}</g>` : inner;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="30" viewBox="0 0 64 30">${g}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Sleigh image for a theme, mirrored when Santa flies west. */
export function sleighImage(marker: MarkerPalette, west: boolean): string {
  return dataUrl(marker.kind === "pixel" ? pixelSleighSvg(marker) : sleighSvg(marker), west);
}

/** True when a bearing in radians (clockwise from north, as `bearingBetween` returns) points into the western half. */
export function headingWest(bearingRadians: number): boolean {
  return Math.sin(bearingRadians) < 0;
}
