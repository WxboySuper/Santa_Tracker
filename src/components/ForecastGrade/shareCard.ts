import type { PackageGrade } from '../../utils/verificationV2';
import { formatGrade } from './gradeFormat';

/**
 * Anonymous grade-plus-map share card (PR 08 — share-docs).
 *
 * Pure helpers (filename + summary text) are unit-tested; the canvas composer is
 * used by the dashboard to produce a downloadable/shareable PNG. No identity is
 * included by default.
 */

/** Filename for a downloaded/shared card. */
export const shareCardFilename = (pkg: PackageGrade): string => {
  const stamp = pkg.generatedAt.slice(0, 10);
  return `forecast-grade-${stamp}.png`;
};

/** Anonymous one-line summary used for native share / copy text. */
export const shareSummaryText = (pkg: PackageGrade): string => {
  const grade = pkg.grade === null ? 'withheld' : `${formatGrade(pkg.grade)} (${pkg.letter})`;
  return `Forecast Grade ${grade} · ${pkg.dataQuality} · formula ${pkg.formulaVersion}`;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const letterColor = (letter: string | null): string => {
  switch (letter) {
    case 'A':
      return '#10b981';
    case 'B':
      return '#84cc16';
    case 'C':
      return '#eab308';
    case 'D':
      return '#f97316';
    case 'F':
      return '#ef4444';
    default:
      return '#94a3b8';
  }
};

const drawMapHero = (
  ctx: CanvasRenderingContext2D,
  mapImage: HTMLImageElement | null,
  width: number,
  height: number
): void => {
  if (!mapImage) {
    return;
  }
  if (mapImage.width <= 0) {
    return;
  }
  if (mapImage.height <= 0) {
    return;
  }
  try {
    const scale = Math.max(width / mapImage.width, height / mapImage.height);
    const drawWidth = mapImage.width * scale;
    const drawHeight = mapImage.height * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    ctx.drawImage(mapImage, offsetX, offsetY, drawWidth, drawHeight);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, height - 210, width, 210);
  } catch {
    // Fall through to text-only layout.
  }
};

/**
 * Composes the map-led share card onto a canvas. The captured map image (when
 * available) fills the hero; the grade and letter are overlaid. Returns null
 * when a 2D context is unavailable (e.g. jsdom).
 */
export const composeShareCard = (
  pkg: PackageGrade,
  mapImage: HTMLImageElement | null
): HTMLCanvasElement | null => {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawMapHero(ctx, mapImage, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('Forecast Grade', 48, CARD_HEIGHT - 140);

  ctx.font = '800 120px system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(formatGrade(pkg.grade), 48, CARD_HEIGHT - 40);

  const gradeWidth = ctx.measureText(formatGrade(pkg.grade)).width;
  ctx.fillStyle = letterColor(pkg.letter);
  ctx.font = '800 90px system-ui, sans-serif';
  ctx.fillText(pkg.letter ?? '—', 48 + gradeWidth + 24, CARD_HEIGHT - 48);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillText(
    `${pkg.dataQuality} · formula ${pkg.formulaVersion}`,
    48,
    CARD_HEIGHT - 4
  );

  return canvas;
};
