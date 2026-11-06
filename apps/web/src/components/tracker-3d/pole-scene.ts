import * as THREE from 'three';
import { COLORS, cylinder, glow, matte, pine, present, seeded, softDotTexture } from '../village/village-kit';
import type { SceneRig } from './mini-scene';

const POLE_HEIGHT = 5.2;
const RING_LIGHTS = 14;

function stripeTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#f7f1e6';
    context.fillRect(0, 0, 64, 256);
    context.fillStyle = '#c93a3a';
    for (let y = -64; y < 320; y += 64) {
      context.beginPath();
      context.moveTo(0, y + 32);
      context.lineTo(64, y);
      context.lineTo(64, y + 32);
      context.lineTo(0, y + 64);
      context.closePath();
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2.4);
  return texture;
}

function islet(): THREE.Group {
  const group = new THREE.Group();
  const ice = cylinder(3.5, 3.0, 0.7, 20, matte(COLORS.ice, { roughness: 0.4 }));
  ice.position.y = -0.35;
  const snow = cylinder(3.15, 3.4, 0.5, 20, matte(COLORS.snow, { roughness: 1 }));
  snow.position.y = 0.05;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), matte(COLORS.snow, { roughness: 1 }));
  cap.scale.y = 0.14;
  cap.position.y = 0.3;
  group.add(ice, snow, cap);
  return group;
}

function star(): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 ? 0.2 : 0.46;
    const angle = (point / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  geometry.translate(0, 0, -0.07);
  const mesh = new THREE.Mesh(geometry, glow(COLORS.gold, 3.2));
  mesh.position.y = POLE_HEIGHT + 0.5;
  return mesh;
}

function halo(texture: THREE.Texture, color: number, scale: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.setScalar(scale);
  return sprite;
}

function beam(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'varying float vY; uniform float uTime; void main(){ float fade = pow(1.0 - vY, 1.5); float pulse = 0.85 + 0.15 * sin(uTime * 2.0 + vY * 9.0); gl_FragColor = vec4(1.0, 0.82, 0.45, fade * 0.12 * pulse); }',
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.07, 9, 24, 1, true), material);
  mesh.position.y = POLE_HEIGHT + 5.0;
  return mesh;
}

function aurora(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec2 vUv; uniform float uTime;',
      'void main(){',
      '  float sway = sin(vUv.x * 6.0 + uTime * 0.6) * 0.5 + sin(vUv.x * 11.0 - uTime * 0.4) * 0.5;',
      '  float rays = 0.55 + 0.45 * sin(vUv.x * 46.0 + sway * 3.0 + uTime * 0.8);',
      '  float height = pow(1.0 - vUv.y, 1.3) * smoothstep(0.0, 0.12, vUv.y);',
      '  float edge = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));',
      '  vec3 color = mix(vec3(0.25, 1.0, 0.72), vec3(0.65, 0.5, 1.0), vUv.y * 0.9 + sway * 0.1);',
      '  gl_FragColor = vec4(color, height * edge * rays * 0.85);',
      '}',
    ].join('\n'),
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(15, 6, 1, 1), material);
  mesh.position.set(0, 7.2, -3.2);
  return mesh;
}

function ring(texture: THREE.Texture): { group: THREE.Group; lights: THREE.Sprite[] } {
  const group = new THREE.Group();
  const lights: THREE.Sprite[] = [];
  const colors = [0xff5a5a, 0xffd36a, 0x6fe3a6];
  for (let index = 0; index < RING_LIGHTS; index += 1) {
    const angle = (index / RING_LIGHTS) * Math.PI * 2;
    const light = halo(texture, colors[index % colors.length] ?? 0xffffff, 0.95, 1);
    light.position.set(Math.cos(angle) * 1.15, Math.sin(angle * 2) * 0.12, Math.sin(angle) * 1.15);
    group.add(light);
    lights.push(light);
  }
  group.position.y = 3.3;
  return { group, lights };
}

function grove(): THREE.Group {
  const group = new THREE.Group();
  const random = seeded(11);
  for (let index = 0; index < 6; index += 1) {
    const angle = 0.6 + (index / 6) * 4.9;
    const tree = pine(1.4 + random() * 0.9, 0.62, 4);
    tree.position.set(Math.cos(angle) * 2.35, 0.3, Math.sin(angle) * 2.0 - 0.3);
    group.add(tree);
  }
  const gifts = [
    { x: 0.7, z: 1.5, size: 0.42, body: COLORS.blue, ribbon: COLORS.gold },
    { x: -0.55, z: 1.7, size: 0.34, body: COLORS.red, ribbon: COLORS.snow },
    { x: 1.2, z: 1.15, size: 0.28, body: COLORS.green, ribbon: COLORS.red },
  ];
  for (const gift of gifts) {
    const box = present(gift.size, gift.body, gift.ribbon);
    box.position.set(gift.x, 0.36, gift.z);
    box.rotation.y = gift.x * 3;
    group.add(box);
  }
  return group;
}

function flurry(texture: THREE.Texture): { points: THREE.Points; step: (delta: number) => void } {
  const count = 46;
  const positions = new Float32Array(count * 3);
  const random = seeded(5);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 8;
    positions[index * 3 + 1] = random() * 8;
    positions[index * 3 + 2] = (random() - 0.5) * 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ map: texture, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, color: 0xffffff }));
  const step = (delta: number) => {
    for (let index = 0; index < count; index += 1) {
      const y = (positions[index * 3 + 1] ?? 0) - delta * 0.5;
      positions[index * 3 + 1] = y < 0 ? 8 : y;
    }
    geometry.attributes.position!.needsUpdate = true;
  };
  return { points, step };
}

/** A small diorama for the top of the map: a candy-cane pole on an ice islet, under a gold beam and the aurora. */
export function buildPoleScene(scene: THREE.Scene): SceneRig {
  const stage = new THREE.Group();
  scene.add(stage);
  const texture = softDotTexture();
  stage.add(islet());
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, POLE_HEIGHT, 16), new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5 }));
  pole.position.y = POLE_HEIGHT / 2 + 0.3;
  stage.add(pole);
  const top = star();
  top.position.y += 0.3;
  const topGlow = halo(texture, 0xffc65c, 3.2, 0.9);
  topGlow.position.copy(top.position);
  stage.add(top, topGlow, grove());
  const lights = ring(texture);
  stage.add(lights.group);
  const beamMesh = beam();
  const auroraMesh = aurora();
  scene.add(beamMesh, auroraMesh);
  const snow = flurry(texture);
  stage.add(snow.points);

  const update = (time: number, delta: number) => {
    stage.rotation.y = Math.sin(time * 0.25) * 0.35;
    lights.group.rotation.y = time * 0.9;
    lights.lights.forEach((light, index) => {
      light.material.opacity = 0.6 + 0.4 * Math.sin(time * 3 + index * 0.9);
    });
    top.rotation.y = time * 1.2;
    topGlow.scale.setScalar(3 + Math.sin(time * 2.2) * 0.35);
    (beamMesh.material as THREE.ShaderMaterial).uniforms.uTime!.value = time;
    (auroraMesh.material as THREE.ShaderMaterial).uniforms.uTime!.value = time;
    snow.step(delta);
  };
  return { update };
}
