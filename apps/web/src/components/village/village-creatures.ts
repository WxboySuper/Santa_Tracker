import * as THREE from 'three';
import { COLORS, box, cylinder, glow, matte } from './village-kit';

export type Reindeer = {
  group: THREE.Group;
  /** Poses the legs for a gallop (0 = idle). */
  gait: (phase: number, amount: number) => void;
  nose: THREE.Mesh;
};

function antler(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const wood = matte(0xd9c9a6);
  const main = cylinder(0.018, 0.026, 0.42, 5, wood);
  main.position.set(0, 0.21, 0);
  main.rotation.z = side * -0.35;
  group.add(main);
  for (const [height, length, tilt] of [
    [0.16, 0.22, 0.9],
    [0.3, 0.2, 0.7],
  ] as const) {
    const prong = cylinder(0.012, 0.018, length, 5, wood);
    prong.position.set(side * (0.05 + height * 0.1), height + 0.04, 0.02);
    prong.rotation.z = side * -tilt;
    prong.rotation.x = 0.4;
    group.add(prong);
  }
  return group;
}

/** A low-poly reindeer facing +z. */
export function createReindeer(options: { redNose?: boolean; scale?: number } = {}): Reindeer {
  const group = new THREE.Group();
  const fur = matte(0x8a5a3a);
  const light = matte(0xe9d8bd);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), fur);
  body.scale.set(0.8, 0.72, 1.35);
  body.position.y = 0.88;
  body.castShadow = true;
  group.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), light);
  chest.scale.set(0.9, 0.9, 0.8);
  chest.position.set(0, 0.8, 0.42);
  group.add(chest);
  const neck = cylinder(0.14, 0.2, 0.55, 8, fur);
  neck.position.set(0, 1.18, 0.62);
  neck.rotation.x = 0.55;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), fur);
  head.scale.set(0.9, 0.9, 1.15);
  head.position.set(0, 1.46, 0.86);
  head.castShadow = true;
  group.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), light);
  snout.scale.set(0.9, 0.8, 1.2);
  snout.position.set(0, 1.4, 1.04);
  group.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), options.redNose ? glow(0xff3030, 4) : matte(0x1a1214));
  nose.position.set(0, 1.42, 1.15);
  group.add(nose);
  for (const x of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), matte(0x120d0f));
    eye.position.set(x, 1.5, 1.0);
    group.add(eye);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 5), fur);
    ear.position.set(x * 1.7, 1.62, 0.8);
    ear.rotation.z = x > 0 ? -0.7 : 0.7;
    group.add(ear);
    const horn = antler(x > 0 ? 1 : -1);
    horn.position.set(x * 0.9, 1.58, 0.82);
    group.add(horn);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), light);
  tail.position.set(0, 1.02, -0.58);
  group.add(tail);

  const legs: THREE.Group[] = [];
  const legOffsets: [number, number][] = [
    [-0.18, 0.4],
    [0.18, 0.4],
    [-0.18, -0.36],
    [0.18, -0.36],
  ];
  for (const [x, z] of legOffsets) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.82, z);
    const upper = cylinder(0.06, 0.07, 0.46, 6, fur);
    upper.position.y = -0.23;
    hip.add(upper);
    const lower = cylinder(0.04, 0.055, 0.42, 6, fur);
    lower.position.y = -0.64;
    hip.add(lower);
    const hoof = box(0.1, 0.07, 0.13, matte(0x241a18));
    hoof.position.set(0, -0.86, 0.02);
    hip.add(hoof);
    group.add(hip);
    legs.push(hip);
  }
  group.scale.setScalar(options.scale ?? 1);

  const gait = (phase: number, amount: number) => {
    legs.forEach((leg, index) => {
      const offset = index < 2 ? 0 : Math.PI;
      const side = index % 2 === 0 ? 0 : 0.5;
      leg.rotation.x = Math.sin(phase + offset + side) * 0.7 * amount;
    });
    body.position.y = 0.88 + Math.abs(Math.sin(phase)) * 0.06 * amount;
  };
  return { group, gait, nose };
}

export type Sleigh = {
  group: THREE.Group;
  /** Advances the gallop and the glow. */
  update: (time: number) => void;
  /** World-space offsets (in the sleigh's local frame) where sparkles are emitted. */
  trailOrigin: THREE.Object3D;
};

/** Santa's sleigh with four reindeer, facing +z. Roughly 6 units long. */
export function createSleigh(): Sleigh {
  const group = new THREE.Group();
  const red = matte(COLORS.red, { roughness: 0.55 });
  const gold = matte(COLORS.gold, { roughness: 0.35, metalness: 0.4 });

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.6, 0);
  cabinShape.lineTo(0.7, 0);
  cabinShape.quadraticCurveTo(1.15, 0.05, 1.15, 0.55);
  cabinShape.quadraticCurveTo(0.95, 0.5, 0.8, 0.72);
  cabinShape.lineTo(-0.55, 0.78);
  cabinShape.quadraticCurveTo(-0.7, 0.4, -0.6, 0);
  const cabin = new THREE.Mesh(new THREE.ExtrudeGeometry(cabinShape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }), red);
  cabin.rotation.y = -Math.PI / 2;
  cabin.position.set(0.45, 0.35, 0.0);
  cabin.castShadow = true;
  group.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 2.0), gold);
  trim.position.set(0, 0.92, -0.05);
  group.add(trim);

  for (const x of [-0.5, 0.5]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.08, -1.0),
      new THREE.Vector3(x, 0.05, 0.9),
      new THREE.Vector3(x, 0.2, 1.35),
      new THREE.Vector3(x, 0.5, 1.45),
    ]);
    const runner = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.05, 6), gold);
    runner.castShadow = true;
    group.add(runner);
    for (const z of [-0.6, 0.55]) {
      const strut = cylinder(0.035, 0.035, 0.3, 5, gold);
      strut.position.set(x, 0.22, z);
      group.add(strut);
    }
  }

  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), matte(0x7c4a2a));
  sack.scale.set(1, 0.9, 1);
  sack.position.set(0, 1.18, -0.62);
  group.add(sack);
  for (const [x, y, z, color] of [
    [0.22, 1.5, -0.55, COLORS.blue],
    [-0.2, 1.48, -0.72, COLORS.green],
  ] as const) {
    const gift = box(0.2, 0.2, 0.2, matte(color));
    gift.position.set(x, y, z);
    gift.rotation.y = x * 2;
    group.add(gift);
  }

  const santa = new THREE.Group();
  santa.position.set(0, 1.0, 0.18);
  const suit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), matte(0xd23030));
  suit.scale.set(1, 1.1, 0.95);
  suit.position.y = 0.3;
  santa.add(suit);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), matte(0xf1c9a5));
  face.position.set(0, 0.76, 0.05);
  santa.add(face);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), matte(0xffffff));
  beard.scale.set(1, 0.9, 0.8);
  beard.position.set(0, 0.64, 0.14);
  santa.add(beard);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.42, 8), matte(0xd23030));
  hat.position.set(0, 1.02, -0.02);
  hat.rotation.x = -0.35;
  santa.add(hat);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), matte(0xffffff));
  pom.position.set(0, 1.16, -0.2);
  santa.add(pom);
  group.add(santa);

  const team: Reindeer[] = [];
  const reinMaterial = new THREE.LineBasicMaterial({ color: 0xffd98a });
  for (const [row, z] of [
    [0, 2.6],
    [1, 4.0],
  ] as const) {
    for (const x of [-0.5, 0.5]) {
      const deer = createReindeer({ redNose: row === 1 && x > 0, scale: 0.78 });
      deer.group.position.set(x, 0, z);
      group.add(deer.group);
      team.push(deer);
    }
  }
  const reins = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 1.0, 0.7),
    new THREE.Vector3(-0.5, 0.9, 2.6),
    new THREE.Vector3(-0.5, 0.9, 4.0),
    new THREE.Vector3(0.5, 0.9, 4.0),
    new THREE.Vector3(0.5, 0.9, 2.6),
    new THREE.Vector3(0, 1.0, 0.7),
  ]);
  group.add(new THREE.Line(reins, reinMaterial));

  const trailOrigin = new THREE.Object3D();
  trailOrigin.position.set(0, 0.5, -1.2);
  group.add(trailOrigin);

  const update = (time: number) => {
    team.forEach((deer, index) => deer.gait(time * 9 + index * 0.6, 1));
    santa.rotation.z = Math.sin(time * 4) * 0.04;
  };
  update(0);
  return { group, update, trailOrigin };
}
