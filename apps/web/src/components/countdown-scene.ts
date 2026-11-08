/** Canvas drawing for the countdown hero: aurora, village, snowfall, and a garland with one bulb per day. */

type Star = { x: number; y: number; r: number; phase: number };
type Flake = { x: number; y: number; r: number; speed: number; sway: number; phase: number };
type House = { x: number; w: number; h: number; roof: number; windows: { x: number; y: number; phase: number }[]; chimney: boolean };
type Pine = { x: number; h: number; w: number };
type Bulb = { colorIndex: number; phase: number };
type Ridge = { base: number; amplitude: number; freq: number; fill: string | CanvasGradient; offset: number };
export type Frame = { time: number; bulbs: Bulbs | null };

export type NightScene = {
  width: number;
  height: number;
  stars: Star[];
  flakes: Flake[];
  houses: House[];
  pines: Pine[];
  bulbs: Bulb[];
  glows: HTMLCanvasElement[];
  skyline: number;
};

export type Bulbs = { total: number; lit: number };

const BULB_COLORS = ['#ff6b5e', '#ffd36a', '#74e0a8', '#8fc4ff', '#ffb37a'];

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function glowSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.25, `${color}aa`);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return sprite;
}

function makeHouses(rand: () => number, width: number, height: number): House[] {
  const houses: House[] = [];
  const count = Math.max(3, Math.round(width / 210));
  for (let index = 0; index < count; index += 1) {
    const w = Math.min(height * (0.19 + rand() * 0.08), (width / count) * 0.72);
    const h = w * (0.75 + rand() * 0.35);
    const windows = Array.from({ length: 1 + Math.floor(rand() * 2) }, (_, i) => ({
      x: (i + 0.5) / 2 + (rand() - 0.5) * 0.08,
      y: 0.35 + rand() * 0.25,
      phase: rand() * 10,
    }));
    houses.push({ x: ((index + 0.3 + rand() * 0.4) / count) * width, w, h, roof: w * 0.55, windows, chimney: rand() > 0.4 });
  }
  return houses;
}

export function createNightScene(width: number, height: number): NightScene {
  const rand = random(7);
  const stars = Array.from({ length: Math.round(width / 7) }, () => ({ x: rand() * width, y: rand() * height * 0.55, r: 0.4 + rand() * 1.1, phase: rand() * 20 }));
  const flakes = Array.from({ length: Math.round(width / 9) }, () => ({ x: rand() * width, y: rand() * height, r: 0.8 + rand() * 2.2, speed: 14 + rand() * 40, sway: 6 + rand() * 18, phase: rand() * 10 }));
  const pines = Array.from({ length: Math.round(width / 70) }, () => ({ x: rand() * width, h: height * (0.12 + rand() * 0.14), w: height * (0.05 + rand() * 0.04) }));
  const bulbs = Array.from({ length: 80 }, (_, index) => ({ colorIndex: index % BULB_COLORS.length, phase: rand() * 10 }));
  return { width, height, stars, flakes, houses: makeHouses(rand, width, height), pines, bulbs, glows: BULB_COLORS.map(glowSprite), skyline: height * 0.7 };
}

function drawSky(context: CanvasRenderingContext2D, scene: NightScene): void {
  const { width, height } = scene;
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#040916');
  sky.addColorStop(0.55, '#10203a');
  sky.addColorStop(1, '#2c3f58');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
}

function drawStars(context: CanvasRenderingContext2D, scene: NightScene, { time }: Frame): void {
  context.fillStyle = '#fff4dc';
  for (const star of scene.stars) {
    context.globalAlpha = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(time * 1.4 + star.phase));
    context.beginPath();
    context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

const RIBBONS = [
  { base: 0.3, spread: 0.2, hue: '110, 255, 190', speed: 0.12, freq: 0.0045 },
  { base: 0.24, spread: 0.18, hue: '150, 140, 255', speed: -0.09, freq: 0.0032 },
  { base: 0.36, spread: 0.14, hue: '90, 220, 255', speed: 0.07, freq: 0.0058 },
];

function drawAurora(context: CanvasRenderingContext2D, scene: NightScene, { time }: Frame): void {
  const { width, height } = scene;
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (const ribbon of RIBBONS) {
    const tall = height * ribbon.spread * 2.2;
    const gradient = context.createLinearGradient(0, 0, 0, tall);
    gradient.addColorStop(0, `rgba(${ribbon.hue}, 0)`);
    gradient.addColorStop(0.65, `rgba(${ribbon.hue}, 0.55)`);
    gradient.addColorStop(1, `rgba(${ribbon.hue}, 0)`);
    for (let x = 0; x < width; x += 6) {
      const wave = Math.sin(x * ribbon.freq + time * ribbon.speed * 3) + Math.sin(x * ribbon.freq * 2.3 - time * ribbon.speed * 2) * 0.5;
      const rays = 0.45 + 0.55 * Math.sin(x * 0.05 + wave * 2 + time * 0.5);
      const edge = Math.min(1, x / (width * 0.12), (width - x) / (width * 0.12));
      context.globalAlpha = Math.max(0, rays * edge) * 0.32;
      context.save();
      context.translate(x, height * ribbon.base + wave * height * 0.05 - tall * 0.3);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 6, tall);
      context.restore();
    }
  }
  context.restore();
}

function drawMoon(context: CanvasRenderingContext2D, scene: NightScene): void {
  const x = scene.width * 0.82;
  const y = scene.height * 0.3;
  const halo = context.createRadialGradient(x, y, 0, x, y, scene.height * 0.35);
  halo.addColorStop(0, 'rgba(255, 244, 220, 0.2)');
  halo.addColorStop(1, 'rgba(255, 244, 220, 0)');
  context.fillStyle = halo;
  context.fillRect(x - scene.height, y - scene.height, scene.height * 2, scene.height * 2);
  context.fillStyle = '#fff4dc';
  context.beginPath();
  context.arc(x, y, scene.height * 0.035, 0, Math.PI * 2);
  context.fill();
}

function drawRidge(context: CanvasRenderingContext2D, scene: NightScene, ridge: Ridge): void {
  const { width, height } = scene;
  const { base, amplitude, freq, offset } = ridge;
  context.fillStyle = ridge.fill;
  context.beginPath();
  context.moveTo(0, height);
  for (let x = 0; x <= width; x += 8) {
    const y = base + Math.sin(x * freq + offset) * amplitude + Math.sin(x * freq * 2.7 + offset * 1.7) * amplitude * 0.4;
    context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.closePath();
  context.fill();
}

function drawPine(context: CanvasRenderingContext2D, baseY: number, pine: Pine): void {
  context.fillStyle = '#12302b';
  context.beginPath();
  for (let tier = 0; tier < 3; tier += 1) {
    const top = baseY - pine.h + (tier * pine.h) / 3.4;
    const half = pine.w * (0.45 + tier * 0.28);
    context.moveTo(pine.x, top);
    context.lineTo(pine.x + half, top + pine.h * 0.42);
    context.lineTo(pine.x - half, top + pine.h * 0.42);
    context.closePath();
  }
  context.fill();
}

function drawWindow(context: CanvasRenderingContext2D, house: House, win: House['windows'][number], baseY: number, { time }: Frame): void {
  const wx = house.x - house.w / 2 + win.x * house.w - house.w * 0.09;
  const wy = baseY - house.h + win.y * house.h;
  const flicker = 0.85 + 0.15 * Math.sin(time * 2.3 + win.phase) * Math.sin(time * 0.7 + win.phase * 2);
  const cx = wx + house.w * 0.09;
  const cy = wy + house.w * 0.09;
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, house.w * 0.55);
  glow.addColorStop(0, `rgba(255, 196, 110, ${0.42 * flicker})`);
  glow.addColorStop(1, 'rgba(255, 196, 110, 0)');
  context.fillStyle = glow;
  context.fillRect(cx - house.w * 0.55, cy - house.w * 0.55, house.w * 1.1, house.w * 1.1);
  context.fillStyle = `rgba(255, 214, 138, ${flicker})`;
  context.fillRect(wx, wy, house.w * 0.18, house.w * 0.2);
}

function drawHouse(context: CanvasRenderingContext2D, scene: NightScene, house: House, frame: Frame): void {
  const baseY = scene.skyline + scene.height * 0.07;
  context.fillStyle = '#3a2b2d';
  context.fillRect(house.x - house.w / 2, baseY - house.h, house.w, house.h);
  context.fillStyle = '#1f3236';
  context.beginPath();
  context.moveTo(house.x - house.w * 0.62, baseY - house.h);
  context.lineTo(house.x, baseY - house.h - house.roof);
  context.lineTo(house.x + house.w * 0.62, baseY - house.h);
  context.closePath();
  context.fill();
  if (house.chimney) {
    context.fillStyle = '#2b2326';
    context.fillRect(house.x + house.w * 0.22, baseY - house.h - house.roof * 0.9, house.w * 0.1, house.roof * 0.6);
  }
  house.windows.forEach((win) => drawWindow(context, house, win, baseY, frame));
}

function drawVillage(context: CanvasRenderingContext2D, scene: NightScene, frame: Frame): void {
  drawRidge(context, scene, { base: scene.skyline - scene.height * 0.12, amplitude: scene.height * 0.05, freq: 0.004, fill: '#1a2b42', offset: 1.2 });
  drawRidge(context, scene, { base: scene.skyline - scene.height * 0.03, amplitude: scene.height * 0.035, freq: 0.007, fill: '#233a50', offset: 4 });
  scene.pines.forEach((pine) => drawPine(context, scene.skyline + scene.height * 0.05, pine));
  scene.houses.forEach((house) => drawHouse(context, scene, house, frame));
  const snow = context.createLinearGradient(0, scene.skyline, 0, scene.height);
  snow.addColorStop(0, '#cddbe2');
  snow.addColorStop(1, '#7f98aa');
  drawRidge(context, scene, { base: scene.skyline + scene.height * 0.08, amplitude: scene.height * 0.025, freq: 0.006, fill: snow, offset: 0.4 });
}

function drawSnowfall(context: CanvasRenderingContext2D, scene: NightScene, { time }: Frame): void {
  context.fillStyle = '#eef6f6';
  for (const flake of scene.flakes) {
    const y = (flake.y + time * flake.speed) % (scene.height + 10);
    const x = flake.x + Math.sin(time * 0.6 + flake.phase) * flake.sway;
    context.globalAlpha = 0.35 + flake.r * 0.2;
    context.beginPath();
    context.arc(x, y - 5, flake.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

/** Sagging swags across the top; bulbs are spread evenly by position, left to right. */
function garlandPoint(scene: NightScene, t: number): { x: number; y: number } {
  const swags = Math.max(2, Math.round(scene.width / 520));
  const local = (t * swags) % 1;
  return { x: -10 + t * (scene.width + 20), y: scene.height * 0.045 + Math.sin(local * Math.PI) * scene.height * 0.13 };
}

function drawWire(context: CanvasRenderingContext2D, scene: NightScene): void {
  context.strokeStyle = '#0d1f1a';
  context.lineWidth = 2;
  context.beginPath();
  for (let step = 0; step <= 120; step += 1) {
    const point = garlandPoint(scene, step / 120);
    if (step === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function drawBulb(context: CanvasRenderingContext2D, scene: NightScene, index: number, frame: Frame & { bulbs: Bulbs }): void {
  const { time, bulbs } = frame;
  const bulb = scene.bulbs[index % scene.bulbs.length];
  const sprite = bulb ? scene.glows[bulb.colorIndex] : undefined;
  if (!bulb || !sprite) return;
  const size = Math.max(4, Math.min(8, scene.width / bulbs.total / 2.4));
  const point = garlandPoint(scene, (index + 0.5) / bulbs.total);
  const darkCount = bulbs.total - bulbs.lit;
  const lit = index >= darkCount;
  const tonight = index === darkCount;
  const cy = point.y + size * 1.1;
  context.fillStyle = lit ? (BULB_COLORS[bulb.colorIndex] ?? '#ffd36a') : '#1d2630';
  context.beginPath();
  context.ellipse(point.x, cy, size * 0.6, size, 0, 0, Math.PI * 2);
  context.fill();
  if (!lit) return;
  const radius = size * (tonight ? 8 * (0.8 + 0.2 * Math.sin(time * 4)) : 5);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = (0.7 + 0.3 * Math.sin(time * 2.4 + bulb.phase)) * (tonight ? 1 : 0.55);
  context.drawImage(sprite, point.x - radius, cy - radius, radius * 2, radius * 2);
  context.restore();
}

function drawGarland(context: CanvasRenderingContext2D, scene: NightScene, frame: Frame & { bulbs: Bulbs }): void {
  drawWire(context, scene);
  for (let index = 0; index < frame.bulbs.total; index += 1) drawBulb(context, scene, index, frame);
}

export function drawNightScene(context: CanvasRenderingContext2D, scene: NightScene, frame: Frame): void {
  context.clearRect(0, 0, scene.width, scene.height);
  drawSky(context, scene);
  drawStars(context, scene, frame);
  drawAurora(context, scene, frame);
  drawMoon(context, scene);
  drawVillage(context, scene, frame);
  drawSnowfall(context, scene, frame);
  if (frame.bulbs) drawGarland(context, scene, { ...frame, bulbs: frame.bulbs });
}
