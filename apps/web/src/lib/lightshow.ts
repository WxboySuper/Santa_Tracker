import { createActivityId } from '@santa-tracker/contracts';
import { migrateActivitySave, type ActivitySaveEnvelope } from '@santa-tracker/activity-sdk/save';

export type LightshowScene = 'tree' | 'house';
export type LightshowPalette = 'warm' | 'classic' | 'ice' | 'redGold';
export type LightshowPattern = 'steady' | 'twinkle' | 'chase' | 'fade' | 'wave';
export type LightshowComposition = {
  scene: LightshowScene;
  palette: LightshowPalette;
  pattern: LightshowPattern;
  speed: number;
  brightness: number;
};

const palettes: Record<LightshowPalette, readonly string[]> = {
  warm: ['#ffe6a3', '#fff3d6', '#ffc982'],
  classic: ['#f45d48', '#48c78e', '#f6d365', '#76b7f7'],
  ice: ['#a8e6ff', '#d6f2ff', '#7aaeff'],
  redGold: ['#d94343', '#f6c85f', '#fff0c2'],
};
const patterns: readonly LightshowPattern[] = ['steady', 'twinkle', 'chase', 'fade', 'wave'];
const scenes: readonly LightshowScene[] = ['tree', 'house'];
const paletteNames: readonly LightshowPalette[] = ['warm', 'classic', 'ice', 'redGold'];
const storageKey = 'santa-tracker-lightshow-v1';
const activityId = createActivityId('lightshow');

export function parseLightshow(payload: unknown): { scene: LightshowScene } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  if (source.kind !== 'lightshow') return null;
  if (source.scene !== undefined && !scenes.includes(source.scene as LightshowScene)) return null;
  return { scene: (source.scene as LightshowScene | undefined) ?? 'tree' };
}

export function lightColor(palette: LightshowPalette, index: number): string {
  const colors = palettes[palette];
  return colors[index % colors.length] ?? colors[0]!;
}

export function lightIntensity(pattern: LightshowPattern, index: number, tick: number, reducedMotion: boolean): number {
  if (pattern === 'steady') return 1;
  const slowTick = reducedMotion ? Math.floor(tick / 8) : tick;
  const phase = (slowTick + index * 3) % 12;
  if (pattern === 'twinkle') return phase < 2 ? 0.38 : phase < 5 ? 0.72 : 1;
  if (pattern === 'chase') return phase < 3 ? 1 : 0.42;
  if (pattern === 'fade') return 0.48 + (Math.sin((slowTick / 6 + index / 4) * Math.PI) + 1) * 0.26;
  return 0.42 + (Math.sin((slowTick / 4 + index / 3) * Math.PI) + 1) * 0.29;
}

export function createLightshowSave(composition: LightshowComposition, savedAtIso = new Date().toISOString()): ActivitySaveEnvelope<LightshowComposition> {
  return { activityId, schemaVersion: 1, savedAtIso, payload: composition };
}

export function restoreLightshowSave(raw: string | null): LightshowComposition | null {
  if (!raw) return null;
  try {
    const save = migrateActivitySave<unknown>(JSON.parse(raw), 1, []);
    if (save.activityId !== activityId) return null;
    return parseComposition(save.payload);
  } catch {
    return null;
  }
}

export function saveLightshow(composition: LightshowComposition): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(createLightshowSave(composition)));
    return true;
  } catch {
    return false;
  }
}

export function loadLightshow(): LightshowComposition | null {
  try {
    return restoreLightshowSave(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function isLightshowComposition(value: unknown): value is LightshowComposition {
  return parseComposition(value) !== null;
}

function parseComposition(value: unknown): LightshowComposition | null {
  if (!isRecord(value)) return null;
  const scene = parseScene(value.scene);
  const palette = parsePalette(value.palette);
  const pattern = parsePattern(value.pattern);
  const speed = parseRange(value.speed, 1, 5);
  const brightness = parseRange(value.brightness, 20, 100);
  if (scene === null) return null;
  if (palette === null) return null;
  if (pattern === null) return null;
  if (speed === null) return null;
  if (brightness === null) return null;
  return { scene, palette, pattern, speed, brightness };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false;
  if (typeof value !== 'object') return false;
  return !Array.isArray(value);
}

function parseScene(value: unknown): LightshowScene | null {
  return scenes.includes(value as LightshowScene) ? value as LightshowScene : null;
}

function parsePalette(value: unknown): LightshowPalette | null {
  return paletteNames.includes(value as LightshowPalette) ? value as LightshowPalette : null;
}

function parsePattern(value: unknown): LightshowPattern | null {
  return patterns.includes(value as LightshowPattern) ? value as LightshowPattern : null;
}

function parseRange(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value < minimum) return null;
  if (value > maximum) return null;
  return value;
}
