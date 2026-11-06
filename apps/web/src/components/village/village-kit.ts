import * as THREE from 'three';

/**
 * Modelling kit for the North Pole diorama. Everything is built from simple primitives with a shared
 * palette, flat shading and emissive windows, so the whole scene reads as one hand-made toy world.
 */

export const COLORS = {
  snow: 0xf1f6fb,
  snowShade: 0xc9d8ea,
  ice: 0x8db9d8,
  wood: 0x7a5238,
  woodDark: 0x4a3023,
  plaster: 0xf0dcc0,
  cream: 0xf6e8cf,
  red: 0xc23a3a,
  redDark: 0x8a2630,
  green: 0x1f6b4d,
  greenDark: 0x144a38,
  teal: 0x2f8f9a,
  blue: 0x3a64b8,
  gold: 0xffc65c,
  warm: 0xffd58a,
  stone: 0x8b8f9c,
  brick: 0xa4503c,
} as const;

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** A matte, slightly rough toy material, cached by colour. */
export function matte(color: number, options: { roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}:${options.roughness ?? 0.85}:${options.metalness ?? 0}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0,
    flatShading: true,
  });
  materialCache.set(key, material);
  return material;
}

/** A glowing material for windows, bulbs and signs. Intensity above 1 feeds the bloom pass. */
export function glow(color: number, intensity = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x20160f,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.6,
  });
}

export function box(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(radiusTop: number, radiusBottom: number, height: number, segments: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A gable-roof prism along the z axis. The base sits at y = 0. */
export function prismGeometry(width: number, height: number, depth: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export type RoofOptions = {
  width: number;
  depth: number;
  height: number;
  color: number;
  overhang?: number;
};

/** A snow-capped gable roof. The returned group's origin is the eave line, centred. */
export function gableRoof({ width, depth, height, color, overhang = 0.35 }: RoofOptions): THREE.Group {
  const group = new THREE.Group();
  const roof = new THREE.Mesh(prismGeometry(width + overhang * 2, height, depth + overhang), matte(color, { roughness: 0.75 }));
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  const coverage = 0.5;
  const capWidth = (width + overhang * 2) * coverage + 0.12;
  const capHeight = height * coverage + 0.12;
  const cap = new THREE.Mesh(prismGeometry(capWidth, capHeight, depth + overhang + 0.3, 0.07), matte(COLORS.snow, { roughness: 0.95 }));
  cap.position.y = height * (1 - coverage) - 0.02;
  cap.castShadow = true;
  group.add(cap);
  return group;
}

export function windowBlock(width: number, height: number, color: number, intensity = 2.2): THREE.Group {
  const group = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), glow(color, intensity));
  pane.name = 'window-pane';
  group.add(pane);
  const bar = matte(COLORS.woodDark);
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.05, height + 0.1, 0.09), bar);
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.05, 0.09), bar);
  group.add(vertical, horizontal);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, height + 0.14, 0.04), bar);
  frame.position.z = -0.03;
  group.add(frame);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, 0.07, 0.16), matte(COLORS.snow));
  sill.position.set(0, -height / 2 - 0.06, 0.05);
  group.add(sill);
  return group;
}

export function doorBlock(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, height + 0.1, 0.05), matte(COLORS.woodDark));
  group.add(frame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.07), matte(COLORS.wood));
  door.position.z = 0.02;
  group.add(door);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glow(COLORS.warm, 3));
  lamp.position.set(width / 2 + 0.2, height / 2 - 0.1, 0.12);
  group.add(lamp);
  const step = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.1, 0.3), matte(COLORS.snow));
  step.position.set(0, -height / 2 + 0.02, 0.18);
  group.add(step);
  return group;
}

export function chimney(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const stack = box(width, height, width, matte(COLORS.brick));
  stack.position.y = height / 2;
  group.add(stack);
  const cap = box(width + 0.14, 0.12, width + 0.14, matte(COLORS.snow));
  cap.position.y = height + 0.04;
  group.add(cap);
  return group;
}

/** A stacked-cone pine. Tiers shrink toward the top; each carries a little snow. */
export function pine(height: number, radius: number, tiers = 4): THREE.Group {
  const group = new THREE.Group();
  const trunk = cylinder(radius * 0.12, radius * 0.16, height * 0.18, 6, matte(COLORS.woodDark));
  trunk.position.y = height * 0.09;
  group.add(trunk);
  const tierHeight = (height * 0.86) / tiers;
  for (let tier = 0; tier < tiers; tier += 1) {
    const t = tier / tiers;
    const r = radius * (1 - t * 0.62);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, tierHeight * 1.7, 8), matte(tier % 2 ? COLORS.green : COLORS.greenDark, { roughness: 0.9 }));
    cone.position.y = height * 0.18 + tier * tierHeight * 0.78 + tierHeight * 0.85;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, tierHeight * 0.9, 8), matte(COLORS.snow, { roughness: 1 }));
    snow.position.y = cone.position.y + tierHeight * 0.42;
    group.add(snow);
  }
  return group;
}

export function snowman(): THREE.Group {
  const group = new THREE.Group();
  const white = matte(COLORS.snow, { roughness: 0.95 });
  const sizes: [number, number][] = [
    [0.5, 0.5],
    [0.37, 1.18],
    [0.27, 1.75],
  ];
  for (const [radius, y] of sizes) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 12), white);
    ball.position.y = y;
    ball.castShadow = true;
    group.add(ball);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 6), matte(0xe8862f));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.78, 0.3);
  group.add(nose);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), matte(0x14141a));
    eye.position.set(x, 1.84, 0.24);
    group.add(eye);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), matte(COLORS.red));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.5;
  group.add(scarf);
  const hat = cylinder(0.2, 0.2, 0.3, 10, matte(0x1e1b26));
  hat.position.y = 2.1;
  group.add(hat);
  const brim = cylinder(0.34, 0.34, 0.04, 12, matte(0x1e1b26));
  brim.position.y = 1.97;
  group.add(brim);
  return group;
}

export function present(size: number, color: number, ribbon: number): THREE.Group {
  const group = new THREE.Group();
  const body = box(size, size * 0.8, size, matte(color));
  body.position.y = (size * 0.8) / 2;
  group.add(body);
  const bandA = box(size * 1.02, size * 0.82, size * 0.16, matte(ribbon));
  bandA.position.y = (size * 0.8) / 2;
  const bandB = box(size * 0.16, size * 0.82, size * 1.02, matte(ribbon));
  bandB.position.y = (size * 0.8) / 2;
  group.add(bandA, bandB);
  const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(size * 0.12, size * 0.04, 24, 6), matte(ribbon));
  bow.position.y = size * 0.9;
  group.add(bow);
  return group;
}

export function lampPost(height = 1.9): THREE.Group {
  const group = new THREE.Group();
  const pole = cylinder(0.05, 0.07, height, 6, matte(0x23222b, { metalness: 0.3 }));
  pole.position.y = height / 2;
  group.add(pole);
  const housing = box(0.24, 0.3, 0.24, matte(0x23222b));
  housing.position.y = height + 0.1;
  group.add(housing);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), glow(COLORS.warm, 3.4));
  bulb.name = 'lamp-bulb';
  bulb.position.y = height + 0.1;
  group.add(bulb);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 4), matte(COLORS.snow));
  cap.rotation.y = Math.PI / 4;
  cap.position.y = height + 0.32;
  group.add(cap);
  return group;
}

export function fence(length: number, color = COLORS.cream): THREE.Group {
  const group = new THREE.Group();
  const posts = Math.max(2, Math.round(length / 0.4));
  const wood = matte(color);
  for (let index = 0; index <= posts; index += 1) {
    const post = box(0.08, 0.5, 0.08, wood);
    post.position.set(-length / 2 + (index * length) / posts, 0.25, 0);
    group.add(post);
    const cap = box(0.12, 0.05, 0.12, matte(COLORS.snow));
    cap.position.set(post.position.x, 0.52, 0);
    group.add(cap);
  }
  for (const y of [0.18, 0.38]) {
    const rail = box(length, 0.05, 0.05, wood);
    rail.position.y = y;
    group.add(rail);
  }
  return group;
}

export type SignOptions = {
  text: string;
  width: number;
  height: number;
  background?: string;
  color?: string;
  neon?: boolean;
};

/** A lit sign: text drawn to a canvas, used as both the colour and the emissive map. */
export function sign({ text, width, height, background = '#241a2e', color = '#ffe1a0', neon = true }: SignOptions): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    let fontSize = Math.round(canvas.height * 0.52);
    context.font = `700 ${fontSize}px "Iowan Old Style", Georgia, serif`;
    while (context.measureText(text).width > canvas.width * 0.82 && fontSize > 12) {
      fontSize -= 2;
      context.font = `700 ${fontSize}px "Iowan Old Style", Georgia, serif`;
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (neon) {
      context.shadowColor = color;
      context.shadowBlur = 24;
    }
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 1.5,
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1), material);
  mesh.castShadow = true;
  return mesh;
}

/** A soft round sprite texture for halos, smoke and snow. */
export function softDotTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A deterministic PRNG so the world is identical on every load. */
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
