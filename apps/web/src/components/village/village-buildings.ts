import * as THREE from 'three';
import {
  COLORS,
  box,
  chimney,
  cylinder,
  doorBlock,
  fence,
  gableRoof,
  glow,
  matte,
  present,
  sign,
  windowBlock,
} from './village-kit';
import { createReindeer } from './village-creatures';

export type BuildingId = 'workshop' | 'arcade' | 'tower' | 'cinema' | 'music' | 'gifts' | 'stable' | 'observatory';

export type Building = {
  id: BuildingId;
  group: THREE.Group;
  /** Invisible, generous pick volume. */
  hit: THREE.Mesh;
  /** Where the camera looks when this building is selected, and where its label floats. */
  focus: THREE.Vector3;
  labelAnchor: THREE.Vector3;
  /** Materials that brighten while the building is hovered. */
  glowMaterials: THREE.MeshStandardMaterial[];
  /** Local-space chimney tops, for smoke. */
  smoke: THREE.Vector3[];
  animate: (time: number, delta: number) => void;
  /** Point lights that warm the snow in front of the building. */
  lights: THREE.PointLight[];
  /** Optional hook used by the music hall. */
  setPlaying?: (playing: boolean) => void;
};

type Wall = { width: number; height: number; depth: number; color: number };

function body(wall: Wall): THREE.Group {
  const group = new THREE.Group();
  const main = box(wall.width, wall.height, wall.depth, matte(wall.color));
  main.position.y = wall.height / 2;
  group.add(main);
  const plinth = box(wall.width + 0.12, 0.28, wall.depth + 0.12, matte(COLORS.stone));
  plinth.position.y = 0.14;
  group.add(plinth);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const post = box(0.14, wall.height, 0.14, matte(COLORS.woodDark));
      post.position.set((x * wall.width) / 2, wall.height / 2, (z * wall.depth) / 2);
      group.add(post);
    }
  }
  const beam = box(wall.width + 0.1, 0.12, wall.depth + 0.1, matte(COLORS.woodDark));
  beam.position.y = wall.height;
  group.add(beam);
  return group;
}

function addWindows(group: THREE.Group, wall: Wall, xs: number[], y: number, color: number, size: [number, number], collect: THREE.MeshStandardMaterial[]): void {
  for (const x of xs) {
    const pane = windowBlock(size[0], size[1], color);
    pane.position.set(x, y, wall.depth / 2 + 0.02);
    group.add(pane);
    pane.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === 'window-pane') collect.push(child.material as THREE.MeshStandardMaterial);
    });
  }
}

function pickBox(width: number, height: number, depth: number, y: number): THREE.Mesh {
  const hit = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = y;
  return hit;
}

function warmLight(x: number, y: number, z: number, intensity = 7): THREE.PointLight {
  const light = new THREE.PointLight(0xffb866, intensity, 9, 2);
  light.position.set(x, y, z);
  return light;
}

function emptyBuilding(id: BuildingId): Building {
  return {
    id,
    group: new THREE.Group(),
    hit: new THREE.Mesh(),
    focus: new THREE.Vector3(),
    labelAnchor: new THREE.Vector3(),
    glowMaterials: [],
    smoke: [],
    animate: () => undefined,
    lights: [],
  };
}

function finish(building: Building, hit: THREE.Mesh, labelHeight: number): Building {
  building.hit = hit;
  building.group.add(hit);
  building.labelAnchor.set(0, labelHeight, 0);
  building.focus.set(0, 1.4, 0);
  return building;
}

function workshop(): Building {
  const building = emptyBuilding('workshop');
  const wall: Wall = { width: 5.2, height: 2.7, depth: 3.9, color: COLORS.plaster };
  const group = building.group;
  group.add(body(wall));
  const roof = gableRoof({ width: wall.width, depth: wall.depth, height: 2.5, color: COLORS.red });
  roof.position.y = wall.height + 0.02;
  group.add(roof);

  const wing = body({ width: 2.6, height: 2.0, depth: 2.6, color: 0xe2c9a3 });
  wing.position.set(-3.7, 0, 0.5);
  group.add(wing);
  const wingRoof = gableRoof({ width: 2.6, depth: 2.6, height: 1.5, color: COLORS.green });
  wingRoof.position.set(-3.7, 2.02, 0.5);
  group.add(wingRoof);

  const chim = chimney(0.7, 2.3);
  chim.position.set(1.4, wall.height + 0.6, -0.6);
  group.add(chim);
  building.smoke.push(new THREE.Vector3(1.4, wall.height + 3.0, -0.6));
  const chim2 = chimney(0.55, 1.6);
  chim2.position.set(-3.2, 2.7, 0.0);
  group.add(chim2);
  building.smoke.push(new THREE.Vector3(-3.2, 4.4, 0.0));

  const door = doorBlock(1.5, 1.9);
  door.position.set(0, 1.12, wall.depth / 2 + 0.03);
  group.add(door);
  const doorGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.03), glow(COLORS.warm, 1.6));
  doorGlow.position.set(0, 1.1, wall.depth / 2 + 0.07);
  group.add(doorGlow);
  building.glowMaterials.push(doorGlow.material);

  addWindows(group, wall, [-1.8, 1.8], 1.55, COLORS.gold, [0.8, 0.95], building.glowMaterials);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20), glow(COLORS.warm, 2.4));
  round.rotation.x = Math.PI / 2;
  round.position.set(0, wall.height + 0.75, wall.depth / 2 + 0.3);
  group.add(round);
  building.glowMaterials.push(round.material);

  const plaque = sign({ text: 'WORKSHOP', width: 2.6, height: 0.62, background: '#5b1d24', color: '#ffd98a' });
  plaque.position.set(0, 2.55, wall.depth / 2 + 0.2);
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);

  for (const x of [-1.0, 1.0]) {
    const cane = new THREE.Group();
    for (let ring = 0; ring < 8; ring += 1) {
      const piece = cylinder(0.09, 0.09, 0.26, 8, matte(ring % 2 ? 0xffffff : COLORS.red));
      piece.position.y = 0.13 + ring * 0.26;
      cane.add(piece);
    }
    cane.position.set(x * 1.0, 0.0, wall.depth / 2 + 0.55);
    group.add(cane);
  }
  for (let index = 0; index < 4; index += 1) {
    const gift = present(0.38 + (index % 2) * 0.12, [COLORS.blue, COLORS.red, COLORS.green, COLORS.gold][index] ?? COLORS.red, [COLORS.gold, COLORS.cream, COLORS.gold, COLORS.red][index] ?? COLORS.gold);
    gift.position.set(2.2 + (index % 2) * 0.5, 0.25, wall.depth / 2 + 0.5 + Math.floor(index / 2) * 0.5);
    gift.rotation.y = index * 0.7;
    group.add(gift);
  }
  building.lights.push(warmLight(0, 1.5, wall.depth / 2 + 2.2, 9));
  return finish(building, pickBox(8.8, 5.4, 4.6, 2.5), 5.8);
}

function arcade(): Building {
  const building = emptyBuilding('arcade');
  const wall: Wall = { width: 4.6, height: 2.3, depth: 3.2, color: COLORS.teal };
  const group = building.group;
  group.add(body(wall));
  const roof = gableRoof({ width: wall.width, depth: wall.depth, height: 1.5, color: COLORS.blue });
  roof.position.y = wall.height + 0.02;
  group.add(roof);

  const plaque = sign({ text: 'ARCADE', width: 3.4, height: 0.86, background: '#1c1130', color: '#ff7ad9' });
  plaque.position.set(0, 3.3, wall.depth / 2 + 0.25);
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);

  const screenMaterial = glow(0x66ddff, 2.4);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.06), screenMaterial);
  screen.position.set(0, 1.4, wall.depth / 2 + 0.04);
  group.add(screen);
  building.glowMaterials.push(screenMaterial);
  const frame = box(2.5, 1.5, 0.08, matte(COLORS.woodDark));
  frame.position.set(0, 1.4, wall.depth / 2 - 0.01);
  group.add(frame);
  for (const x of [-1.8, 1.8]) {
    const cabinetBody = box(0.7, 1.4, 0.5, matte(0x2b2f6b));
    cabinetBody.position.set(x, 0.85, wall.depth / 2 + 0.45);
    group.add(cabinetBody);
    const cabinetScreen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04), glow(x < 0 ? 0xffe27a : 0x7affb0, 2.4));
    cabinetScreen.position.set(x, 1.1, wall.depth / 2 + 0.72);
    group.add(cabinetScreen);
    building.glowMaterials.push(cabinetScreen.material);
  }
  const bulbs: THREE.MeshStandardMaterial[] = [];
  const count = 16;
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const material = glow(0xffdf8a, 3);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), material);
    const onTop = index % 2 === 0;
    bulb.position.set(-1.8 + t * 3.6, onTop ? 3.8 : 2.84, wall.depth / 2 + 0.3);
    group.add(bulb);
    bulbs.push(material);
  }
  const chim = chimney(0.5, 1.2);
  chim.position.set(1.4, wall.height + 0.5, -0.5);
  group.add(chim);
  building.smoke.push(new THREE.Vector3(1.4, wall.height + 1.9, -0.5));
  const door = doorBlock(0.9, 1.5);
  door.position.set(-0.0, 0.8, wall.depth / 2 - 0.5);
  door.visible = false;
  group.add(door);
  building.animate = (time) => {
    const hue = (time * 0.12) % 1;
    screenMaterial.emissive.setHSL(hue, 0.7, 0.55);
    bulbs.forEach((material, index) => {
      material.emissiveIntensity = 1.2 + Math.max(0, Math.sin(time * 5 - index * 0.7)) * 3;
    });
  };
  building.lights.push(warmLight(0, 1.4, wall.depth / 2 + 2.2, 8));
  const blue = new THREE.PointLight(0x66ddff, 5, 7, 2);
  blue.position.set(0, 1.5, wall.depth / 2 + 1.0);
  building.lights.push(blue);
  return finish(building, pickBox(5.4, 5.2, 4.0, 2.5), 5.0);
}

function tower(): Building {
  const building = emptyBuilding('tower');
  const group = building.group;
  const base = body({ width: 3.4, height: 1.6, depth: 3.0, color: 0xcfd7e4 });
  group.add(base);
  const baseRoof = box(3.7, 0.2, 3.3, matte(COLORS.snow));
  baseRoof.position.y = 1.7;
  group.add(baseRoof);
  const shaft = cylinder(0.85, 1.05, 3.4, 8, matte(0xe9eef7));
  shaft.position.set(0, 3.5, 0);
  group.add(shaft);
  for (const y of [2.6, 3.9]) {
    const band = cylinder(0.9, 0.95, 0.22, 8, matte(COLORS.red));
    band.position.set(0, y, 0);
    group.add(band);
  }
  const cabinGlass = glow(0x7fe3ff, 2.6);
  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.1, 0.95, 8), cabinGlass);
  cabin.position.y = 5.6;
  group.add(cabin);
  building.glowMaterials.push(cabinGlass);
  const cabinRoof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.55, 8), matte(COLORS.snow));
  cabinRoof.position.y = 6.35;
  cabinRoof.castShadow = true;
  group.add(cabinRoof);
  const ring = cylinder(1.38, 1.38, 0.08, 8, matte(COLORS.woodDark));
  ring.position.y = 5.1;
  group.add(ring);

  const mast = cylinder(0.05, 0.06, 1.2, 6, matte(0x23222b));
  mast.position.y = 7.0;
  group.add(mast);
  const dish = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xf1f4fb, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }));
  bowl.rotation.x = -Math.PI / 2.4;
  bowl.castShadow = true;
  dish.add(bowl);
  const feed = cylinder(0.025, 0.025, 0.6, 5, matte(0x23222b));
  feed.rotation.x = Math.PI / 2 - 0.4;
  feed.position.set(0, 0.34, 0.42);
  dish.add(feed);
  dish.position.y = 7.4;
  group.add(dish);

  const beaconMaterial = glow(0xff3030, 4);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), beaconMaterial);
  beacon.position.y = 7.75;
  group.add(beacon);

  const door = doorBlock(0.9, 1.3);
  door.position.set(0, 0.95, 1.53);
  group.add(door);
  const wall: Wall = { width: 3.4, height: 1.6, depth: 3.0, color: 0 };
  addWindows(group, wall, [-1.0, 1.0], 1.05, 0x7fe3ff, [0.55, 0.5], building.glowMaterials);
  const plaque = sign({ text: 'SANTA TRACKER', width: 2.6, height: 0.5, background: '#14233b', color: '#9fe8ff' });
  plaque.position.set(0, 1.95, 1.62);
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);

  building.animate = (time) => {
    dish.rotation.y = time * 0.7;
    beaconMaterial.emissiveIntensity = 1.5 + (Math.sin(time * 4) > 0.2 ? 4 : 0);
  };
  const cool = new THREE.PointLight(0x7fe3ff, 6, 9, 2);
  cool.position.set(0, 5.6, 1.2);
  building.lights.push(cool);
  return finish(building, pickBox(3.8, 8.6, 3.8, 4.3), 8.4);
}

function cinema(): Building {
  const building = emptyBuilding('cinema');
  const wall: Wall = { width: 4.4, height: 2.5, depth: 3.4, color: 0x8a2c3d };
  const group = building.group;
  group.add(body(wall));
  const slab = box(4.8, 0.22, 3.8, matte(COLORS.snow));
  slab.position.y = wall.height + 0.14;
  group.add(slab);
  const parapet = box(4.6, 0.5, 3.6, matte(0x5f1d2b));
  parapet.position.y = wall.height + 0.1;
  parapet.scale.y = 0.6;
  group.add(parapet);

  const plaque = sign({ text: 'CINEMA', width: 3.0, height: 0.8, background: '#240d18', color: '#ffcf6a' });
  plaque.position.set(0, 3.55, wall.depth / 2 + 0.2);
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);

  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.0, 14, 1, false, 0, Math.PI), matte(0xe9d8b8));
  canopy.rotation.z = Math.PI / 2;
  canopy.rotation.y = Math.PI / 2;
  canopy.scale.set(1, 1, 0.6);
  canopy.position.set(0, 1.95, wall.depth / 2 + 0.55);
  canopy.castShadow = true;
  group.add(canopy);
  const bulbs: THREE.MeshStandardMaterial[] = [];
  for (let index = 0; index < 14; index += 1) {
    const t = index / 13;
    const material = glow(0xffdf8a, 3);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), material);
    const angle = Math.PI * t;
    bulb.position.set(-1.5 + t * 3.0, 1.95 + Math.sin(angle) * 0.0, wall.depth / 2 + 1.05);
    bulb.position.y = 1.5 + Math.sin(angle) * 0.04;
    group.add(bulb);
    bulbs.push(material);
  }
  const door = doorBlock(1.3, 1.6);
  door.position.set(0, 0.95, wall.depth / 2 + 0.03);
  group.add(door);
  for (const x of [-1.6, 1.6]) {
    const poster = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.05), glow(x < 0 ? 0x7aa8ff : 0xffa86a, 1.8));
    poster.position.set(x, 1.45, wall.depth / 2 + 0.05);
    group.add(poster);
    building.glowMaterials.push(poster.material);
    const framePoster = box(0.9, 1.25, 0.04, matte(COLORS.gold, { metalness: 0.4 }));
    framePoster.position.set(x, 1.45, wall.depth / 2 + 0.02);
    group.add(framePoster);
  }
  building.animate = (time) => {
    bulbs.forEach((material, index) => {
      material.emissiveIntensity = 1 + Math.max(0, Math.sin(time * 6 - index * 0.6)) * 3.5;
    });
  };
  building.lights.push(warmLight(0, 1.4, wall.depth / 2 + 2.3, 8));
  return finish(building, pickBox(5.2, 5.0, 4.4, 2.5), 5.0);
}

function musicHall(): Building {
  const building = emptyBuilding('music');
  const wall: Wall = { width: 3.4, height: 2.4, depth: 3.8, color: COLORS.cream };
  const group = building.group;
  group.add(body(wall));
  const roof = gableRoof({ width: wall.width, depth: wall.depth, height: 1.9, color: COLORS.green });
  roof.position.y = wall.height + 0.02;
  group.add(roof);
  const steeple = body({ width: 1.2, height: 2.0, depth: 1.2, color: COLORS.cream });
  steeple.position.set(0, wall.height + 0.6, wall.depth / 2 - 0.4);
  group.add(steeple);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.98, 1.9, 4), matte(COLORS.green));
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, wall.height + 2.6 + 0.95, wall.depth / 2 - 0.4);
  spire.castShadow = true;
  group.add(spire);
  const spireSnow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), matte(COLORS.snow));
  spireSnow.rotation.y = Math.PI / 4;
  spireSnow.position.set(0, wall.height + 2.6 + 1.5, wall.depth / 2 - 0.4);
  group.add(spireSnow);
  const bellMaterial = glow(COLORS.gold, 2.2);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.75), bellMaterial);
  bell.position.set(0, wall.height + 1.7, wall.depth / 2 + 0.2);
  bell.rotation.x = Math.PI;
  group.add(bell);
  building.glowMaterials.push(bellMaterial);
  const cross = box(0.06, 0.4, 0.06, matte(COLORS.gold, { metalness: 0.5 }));
  cross.position.set(0, wall.height + 4.75, wall.depth / 2 - 0.4);
  const crossBar = box(0.26, 0.06, 0.06, matte(COLORS.gold, { metalness: 0.5 }));
  crossBar.position.set(0, wall.height + 4.82, wall.depth / 2 - 0.4);
  group.add(cross, crossBar);

  const door = doorBlock(1.1, 1.6);
  door.position.set(0, 0.95, wall.depth / 2 + 0.55);
  group.add(door);
  addWindows(group, wall, [-1.2, 1.2], 1.4, COLORS.gold, [0.5, 1.0], building.glowMaterials);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18), glow(0xffa86a, 2.4));
  rose.rotation.x = Math.PI / 2;
  rose.position.set(0, wall.height + 0.1, wall.depth / 2 + 0.55);
  rose.visible = false;
  group.add(rose);

  const notes: THREE.Sprite[] = [];
  const noteTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#ffe9b8';
      context.shadowColor = '#ffb85c';
      context.shadowBlur = 10;
      context.font = '48px serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('♪', 32, 34);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  for (let index = 0; index < 5; index += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture, transparent: true, opacity: 0, depthWrite: false }));
    sprite.scale.setScalar(0.6);
    group.add(sprite);
    notes.push(sprite);
  }
  let playing = false;
  building.setPlaying = (value) => {
    playing = value;
  };
  building.animate = (time) => {
    bell.rotation.z = Math.sin(time * (playing ? 6 : 1.2)) * (playing ? 0.35 : 0.08);
    notes.forEach((sprite, index) => {
      const material = sprite.material;
      if (!playing) {
        material.opacity = Math.max(0, material.opacity - 0.05);
        return;
      }
      const life = (time * 0.35 + index / notes.length) % 1;
      sprite.position.set(Math.sin(life * 6 + index * 2) * 0.7, wall.height + 1.4 + life * 3.2, wall.depth / 2 + 0.5);
      material.opacity = Math.sin(life * Math.PI) * 0.95;
    });
  };
  building.lights.push(warmLight(0, 1.4, wall.depth / 2 + 1.9, 7));
  return finish(building, pickBox(4.0, 6.0, 4.6, 3.0), 6.4);
}

function giftShop(): Building {
  const building = emptyBuilding('gifts');
  const wall: Wall = { width: 3.0, height: 1.9, depth: 2.6, color: 0xdc98ab };
  const group = building.group;
  group.add(body(wall));
  const roof = gableRoof({ width: wall.width, depth: wall.depth, height: 1.4, color: COLORS.red });
  roof.position.y = wall.height + 0.02;
  group.add(roof);
  const plaque = sign({ text: 'GIFTS', width: 1.8, height: 0.5, background: '#4b1a30', color: '#ffe1a0' });
  plaque.position.set(0, 2.3, wall.depth / 2 + 0.45);
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);
  for (let index = 0; index < 8; index += 1) {
    const stripe = box(0.4, 0.06, 0.8, matte(index % 2 ? 0xffffff : COLORS.red));
    stripe.position.set(-1.4 + index * 0.4, 1.78, wall.depth / 2 + 0.38);
    stripe.rotation.x = 0.45;
    group.add(stripe);
  }
  const shopWindow = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.95, 0.06), glow(COLORS.warm, 1.8));
  shopWindow.position.set(0.3, 1.0, wall.depth / 2 + 0.04);
  group.add(shopWindow);
  building.glowMaterials.push(shopWindow.material);
  for (let index = 0; index < 5; index += 1) {
    const gift = present(0.24, [COLORS.blue, COLORS.green, COLORS.red, COLORS.gold, COLORS.teal][index] ?? COLORS.red, COLORS.cream);
    gift.position.set(-0.45 + index * 0.4, 0.58, wall.depth / 2 + 0.22);
    group.add(gift);
  }
  const door = doorBlock(0.7, 1.4);
  door.position.set(-1.05, 0.85, wall.depth / 2 + 0.03);
  group.add(door);
  const chim = chimney(0.4, 1.0);
  chim.position.set(0.9, wall.height + 0.6, -0.4);
  group.add(chim);
  building.smoke.push(new THREE.Vector3(0.9, wall.height + 1.8, -0.4));
  building.lights.push(warmLight(0, 1.2, wall.depth / 2 + 1.7, 6));
  return finish(building, pickBox(3.6, 4.2, 3.2, 2.1), 4.3);
}

function stable(): Building {
  const building = emptyBuilding('stable');
  const wall: Wall = { width: 5.0, height: 1.7, depth: 2.6, color: COLORS.wood };
  const group = building.group;
  group.add(body(wall));
  const roof = gableRoof({ width: wall.width, depth: wall.depth, height: 1.2, color: COLORS.redDark });
  roof.rotation.y = Math.PI / 2;
  roof.scale.set(1, 1, 1);
  roof.position.y = wall.height + 0.02;
  group.add(roof);
  const stableDoor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.06), glow(COLORS.warm, 1.4));
  stableDoor.position.set(0, 0.95, wall.depth / 2 + 0.04);
  group.add(stableDoor);
  building.glowMaterials.push(stableDoor.material);
  const sign1 = sign({ text: 'STABLE', width: 1.5, height: 0.4, background: '#3a2416', color: '#ffd98a', neon: false });
  sign1.position.set(0, 1.95, wall.depth / 2 + 0.1);
  group.add(sign1);
  const pen = fence(4.6);
  pen.position.set(0, 0, wall.depth / 2 + 2.4);
  group.add(pen);
  for (const side of [-1, 1]) {
    const post = fence(2.4);
    post.rotation.y = Math.PI / 2;
    post.position.set(side * 2.3, 0, wall.depth / 2 + 1.2);
    group.add(post);
  }
  const deer = [createReindeer({ scale: 0.8 }), createReindeer({ scale: 0.7, redNose: true })];
  deer[0]?.group.position.set(-1.0, 0.0, wall.depth / 2 + 1.3);
  deer[1]?.group.position.set(1.1, 0.0, wall.depth / 2 + 1.5);
  deer[0]?.group.rotateY(0.4);
  deer[1]?.group.rotateY(-0.5);
  deer.forEach((entry) => group.add(entry.group));
  const hay = box(0.9, 0.5, 0.6, matte(0xd9b45a));
  hay.position.set(2.6, 0.25, wall.depth / 2 + 0.2);
  group.add(hay);
  building.animate = (time) => {
    deer.forEach((entry, index) => {
      entry.group.children[2]?.rotation.set(0.55 + Math.sin(time * 0.9 + index) * 0.12, 0, 0);
      entry.gait(0, 0);
    });
  };
  building.lights.push(warmLight(0, 1.2, wall.depth / 2 + 2.0, 6));
  return finish(building, pickBox(5.6, 3.4, 6.2, 1.7), 3.4);
}

function observatory(): Building {
  const building = emptyBuilding('observatory');
  const group = building.group;
  const base = cylinder(1.5, 1.7, 2.0, 12, matte(0x6f7fa8));
  base.position.y = 1.0;
  group.add(base);
  for (let ring = 0; ring < 3; ring += 1) {
    const band = cylinder(1.56, 1.56, 0.08, 12, matte(COLORS.woodDark));
    band.position.y = 0.4 + ring * 0.6;
    group.add(band);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfd9ee, roughness: 0.35, metalness: 0.3 }));
  dome.position.y = 2.0;
  dome.castShadow = true;
  const turret = new THREE.Group();
  turret.add(dome);
  group.add(turret);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.9, 0.9), glow(0x9fc2ff, 2.2));
  slit.position.set(0, 2.9, 0.9);
  slit.rotation.x = -0.55;
  turret.add(slit);
  building.glowMaterials.push(slit.material);
  const scope = cylinder(0.12, 0.18, 1.4, 8, matte(0x2a3042, { metalness: 0.4 }));
  scope.position.set(0, 3.1, 0.7);
  scope.rotation.x = -1.0;
  turret.add(scope);
  const door = doorBlock(0.8, 1.3);
  door.position.set(0, 0.8, 1.62);
  group.add(door);
  const window1 = windowBlock(0.5, 0.5, 0x9fc2ff);
  window1.position.set(1.1, 1.4, 1.1);
  window1.rotation.y = 0.7;
  group.add(window1);
  window1.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name === 'window-pane') building.glowMaterials.push(child.material as THREE.MeshStandardMaterial);
  });
  const plaque = sign({ text: 'OBSERVATORY', width: 2.2, height: 0.42, background: '#141c3a', color: '#aac8ff' });
  plaque.position.set(0, 2.3, 1.8);
  plaque.rotation.x = -0.15;
  group.add(plaque);
  building.glowMaterials.push(plaque.material as THREE.MeshStandardMaterial);
  building.animate = (time) => {
    turret.rotation.y = Math.sin(time * 0.15) * 0.5;
  };
  const cool = new THREE.PointLight(0x9fc2ff, 4, 8, 2);
  cool.position.set(0, 1.6, 2.4);
  building.lights.push(cool);
  return finish(building, pickBox(3.8, 4.6, 3.8, 2.3), 4.8);
}

export type Placement = { id: BuildingId; x: number; z: number; y?: number; face: [number, number] };

/** A horseshoe open toward the viewer, so every front faces the camera or the plaza. */
export const PLACEMENTS: Placement[] = [
  { id: 'workshop', x: 0, z: -8.4, face: [0, 30] },
  { id: 'arcade', x: -8.8, z: -5.4, face: [5, 22] },
  { id: 'tower', x: 8.8, z: -5.6, face: [-5, 22] },
  { id: 'music', x: -11.2, z: 1.0, face: [12, 10] },
  { id: 'cinema', x: 11.4, z: 1.2, face: [-12, 10] },
  { id: 'observatory', x: -4.6, z: -10.9, y: 0.4, face: [3, 30] },
  { id: 'stable', x: 5.6, z: -10.8, face: [-2, 30] },
  { id: 'gifts', x: -6.6, z: 7.2, face: [2, 30] },
];

const BUILDERS: Record<BuildingId, () => Building> = {
  workshop,
  arcade,
  tower,
  cinema,
  music: musicHall,
  gifts: giftShop,
  stable,
  observatory,
};

/** Builds every building, rotates each one to face the plaza, and sets it down on the island. */
export function createBuildings(): Building[] {
  return PLACEMENTS.map((placement) => {
    const building = BUILDERS[placement.id]();
    building.group.position.set(placement.x, placement.y ?? 0, placement.z);
    building.group.lookAt(placement.face[0], building.group.position.y, placement.face[1]);
    return building;
  });
}
