import * as THREE from 'three';
import { createSleigh } from '../village/village-creatures';
import { seeded, softDotTexture } from '../village/village-kit';
import type { SceneRig } from './mini-scene';

const SPARKLES = 48;
const LIFE = 1.6;

type Sparkles = {
  points: THREE.Points;
  step: (time: number, delta: number, origin: THREE.Vector3, back: THREE.Vector3) => void;
};

function sparkles(): Sparkles {
  const positions = new Float32Array(SPARKLES * 3);
  const ages = new Float32Array(SPARKLES);
  const random = seeded(23);
  ages.forEach((_, index) => {
    ages[index] = random() * LIFE;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: softDotTexture(),
    size: 0.5,
    color: 0xffe3a0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const step = (_time: number, delta: number, origin: THREE.Vector3, back: THREE.Vector3) => {
    for (let index = 0; index < SPARKLES; index += 1) {
      const age = (ages[index] ?? 0) + delta;
      ages[index] = age > LIFE ? 0 : age;
      const t = (ages[index] ?? 0) / LIFE;
      positions[index * 3] = origin.x + back.x * t * 4.5 + Math.sin(index * 12.9) * 0.25 * t;
      positions[index * 3 + 1] = origin.y + Math.sin(index * 7.7) * 0.3 + t * 0.4;
      positions[index * 3 + 2] = origin.z + back.z * t * 4.5 + Math.cos(index * 5.1) * 0.25 * t;
    }
    geometry.attributes.position!.needsUpdate = true;
  };
  return { points, step };
}

function underGlow(): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffd58a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.setScalar(9);
  sprite.position.set(0, -0.2, 1.8);
  return sprite;
}

/** Santa's sleigh, seen from above and behind, turning to follow the route. */
export function buildSleighScene(scene: THREE.Scene): SceneRig {
  const sleigh = createSleigh();
  const heading = new THREE.Group();
  heading.add(sleigh.group);
  sleigh.group.position.z = -2.2;
  scene.add(heading, underGlow());
  const trail = sparkles();
  scene.add(trail.points);
  const origin = new THREE.Vector3();
  const back = new THREE.Vector3();

  const setHeading = (bearing: number) => {
    heading.rotation.y = Math.PI - bearing;
  };
  const update = (time: number, delta: number) => {
    sleigh.update(time);
    sleigh.group.position.y = Math.sin(time * 2.1) * 0.12;
    sleigh.trailOrigin.getWorldPosition(origin);
    back.set(-Math.sin(heading.rotation.y), 0, -Math.cos(heading.rotation.y));
    trail.step(time, delta, origin, back);
  };
  return { update, setHeading };
}
