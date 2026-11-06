import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, cylinder, lampPost, matte, seeded, softDotTexture, snowman } from './village-kit';
import { createBuildings, type Building } from './village-buildings';
import { createSleigh } from './village-creatures';

export const PLAZA = new THREE.Vector3(0, 0, 1.2);

export type World = {
  root: THREE.Group;
  buildings: Building[];
  update: (time: number, delta: number) => void;
  moon: THREE.DirectionalLight;
  sleighPosition: () => THREE.Vector3;
};

/* ------------------------------------------------------------------ island */

function islandShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const steps = 72;
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const radius = 1 + 0.06 * Math.sin(angle * 3 + 1) + 0.04 * Math.sin(angle * 5 + 0.4) + 0.025 * Math.sin(angle * 9);
    const x = Math.cos(angle) * 15.2 * radius;
    const y = Math.sin(angle) * 12.4 * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function buildIsland(): THREE.Group {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.ExtrudeGeometry(islandShape(), { depth: 1.1, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.3, bevelSegments: 3, curveSegments: 24 }),
    new THREE.MeshStandardMaterial({ color: COLORS.snow, roughness: 0.95, flatShading: true }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = -1.1;
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);

  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(12.5, 9, 9, 3),
    new THREE.MeshStandardMaterial({ color: 0x7ea6c8, roughness: 0.55, flatShading: true, emissive: 0x16304e, emissiveIntensity: 0.6 }),
  );
  rock.rotation.x = Math.PI;
  rock.scale.set(1.2, 1, 0.98);
  rock.position.y = -5.9;
  const positions = rock.geometry.attributes.position;
  if (positions) {
    for (let index = 0; index < positions.count; index += 1) {
      const wobble = 1 + Math.sin(index * 12.9898) * 0.07;
      positions.setXYZ(index, positions.getX(index) * wobble, positions.getY(index), positions.getZ(index) * wobble);
    }
    rock.geometry.computeVertexNormals();
  }
  rock.castShadow = true;
  group.add(rock);

  const random = seeded(11);
  const mound = new THREE.SphereGeometry(1, 12, 8);
  const snow = matte(COLORS.snow, { roughness: 1 });
  for (let index = 0; index < 26; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 0.55 + random() * 0.38;
    const mesh = new THREE.Mesh(mound, snow);
    mesh.position.set(Math.cos(angle) * 14.6 * distance, -0.05, Math.sin(angle) * 11.8 * distance);
    mesh.scale.set(1 + random() * 1.6, 0.18 + random() * 0.32, 1 + random() * 1.4);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.06, 40), matte(0xe0eaf5, { roughness: 1 }));
  plaza.position.set(PLAZA.x, 0.03, PLAZA.z);
  plaza.receiveShadow = true;
  group.add(plaza);
  return group;
}

function buildPaths(buildings: Building[]): THREE.Group {
  const group = new THREE.Group();
  const material = matte(0xdfe8f3, { roughness: 1 });
  for (const building of buildings) {
    const from = new THREE.Vector3(building.group.position.x, 0, building.group.position.z);
    const to = new THREE.Vector3(PLAZA.x, 0, PLAZA.z);
    const length = from.distanceTo(to) - 3.2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, length), material);
    const middle = from.clone().lerp(to, 0.5);
    strip.position.set(middle.x, 0.025, middle.z);
    strip.lookAt(to.x, 0.025, to.z);
    strip.receiveShadow = true;
    group.add(strip);
  }
  return group;
}

/* ------------------------------------------------------------------- trees */

function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const color = (geometry: THREE.BufferGeometry, value: number) => {
    const rgb = new THREE.Color(value);
    const count = geometry.attributes.position?.count ?? 0;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = rgb.r;
      colors[index * 3 + 1] = rgb.g;
      colors[index * 3 + 2] = rgb.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6);
  trunk.translate(0, 0.35, 0);
  parts.push(color(trunk, COLORS.woodDark));
  const tiers = 4;
  for (let tier = 0; tier < tiers; tier += 1) {
    const radius = 1.0 - tier * 0.2;
    const cone = new THREE.ConeGeometry(radius, 1.3, 8);
    cone.translate(0, 0.9 + tier * 0.78 + 0.65, 0);
    parts.push(color(cone.toNonIndexed(), tier % 2 ? COLORS.green : COLORS.greenDark));
    const cap = new THREE.ConeGeometry(radius * 0.7, 0.62, 8);
    cap.translate(0, 0.9 + tier * 0.78 + 1.1, 0);
    parts.push(color(cap.toNonIndexed(), COLORS.snow));
  }
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  return merged ?? new THREE.BufferGeometry();
}

function buildForest(avoid: Building[]): THREE.InstancedMesh {
  const random = seeded(77);
  const geometry = pineGeometry();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const spots: { x: number; z: number; scale: number }[] = [];
  let attempts = 0;
  while (spots.length < 44 && attempts < 4000) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const distance = 0.7 + random() * 0.32;
    const x = Math.cos(angle) * 15 * distance;
    const z = Math.sin(angle) * 12.2 * distance;
    if (isForestSpotAllowed(x, z, avoid)) spots.push({ x, z, scale: 0.42 + random() * 0.55 });
  }
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach((spot, index) => {
    matrix.compose(
      new THREE.Vector3(spot.x, 0, spot.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0)),
      new THREE.Vector3(spot.scale, spot.scale * (0.9 + random() * 0.4), spot.scale),
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function isForestSpotAllowed(x: number, z: number, avoid: Building[]): boolean {
  const insideIsland = (x / 15.2) ** 2 + (z / 12.4) ** 2 < 0.88;
  const clearOfBuildings = avoid.every((building) => Math.hypot(building.group.position.x - x, building.group.position.z - z) > 4.4);
  const clearOfPlaza = Math.hypot(x - PLAZA.x, z - PLAZA.z) >= 5.8;
  const outsideViewLane = z <= 3.5 || Math.abs(x) >= 8;
  return insideIsland && clearOfBuildings && clearOfPlaza && outsideViewLane;
}

/* ------------------------------------------------------------ twinkle lights */

type TwinkleOptions = { size: number; points: { position: THREE.Vector3; color: THREE.Color; phase?: number }[] };

function twinkle({ size, points }: TwinkleOptions): { points: THREE.Points; material: THREE.ShaderMaterial } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flatMap((point) => [point.position.x, point.position.y, point.position.z])), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(points.flatMap((point) => [point.color.r, point.color.g, point.color.b])), 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(new Float32Array(points.map((point, index) => point.phase ?? index * 1.37)), 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uMap: { value: softDotTexture() } },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float phase;
      uniform float uTime; uniform float uSize;
      varying vec3 vColor; varying float vGlow;
      void main() {
        vColor = color;
        vGlow = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 2.4 + phase * 3.1));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (0.8 + 0.5 * vGlow) * (60.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec3 vColor; varying float vGlow;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * (0.7 + vGlow * 0.8), tex.a * vGlow);
      }`,
  });
  return { points: new THREE.Points(geometry, material), material };
}

/* --------------------------------------------------------------- christmas tree */

function buildPlazaTree(): { group: THREE.Group; star: THREE.Mesh; lights: ReturnType<typeof twinkle> } {
  const group = new THREE.Group();
  const trunk = cylinder({ radiusTop: 0.35, radiusBottom: 0.5, height: 1.0, segments: 8, material: matte(COLORS.woodDark) });
  trunk.position.y = 0.5;
  group.add(trunk);
  const tiers = 6;
  const points: TwinkleOptions['points'] = [];
  const palette = [0xff5a5a, 0xffd166, 0x66d3ff, 0x8affb0, 0xff9be0, 0xffffff].map((value) => new THREE.Color(value));
  for (let tier = 0; tier < tiers; tier += 1) {
    const t = tier / (tiers - 1);
    const radius = 2.9 - t * 2.1;
    const height = 2.1;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 12), matte(tier % 2 ? COLORS.green : COLORS.greenDark, { roughness: 0.9 }));
    const y = 1.3 + tier * 1.12 + height / 2;
    cone.position.y = y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.74, height * 0.52, 12), matte(COLORS.snow, { roughness: 1 }));
    snow.position.y = y + height * 0.26;
    group.add(snow);
    const count = Math.round(8 + radius * 5);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + tier * 0.7;
      const rr = radius * (0.5 + ((index * 7) % 3) * 0.17);
      points.push({
        position: new THREE.Vector3(Math.cos(angle) * rr, y - height * 0.32 + ((index * 5) % 4) * 0.12, Math.sin(angle) * rr),
        color: palette[(index + tier) % palette.length] ?? palette[0]!,
        phase: index * 0.9 + tier,
      });
    }
  }
  const lights = twinkle({ size: 7, points });
  group.add(lights.points);
  const starShape = plazaStarShape();
  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape, { depth: 0.18, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x2a1c0a, emissive: 0xffd36b, emissiveIntensity: 3 }),
  );
  star.position.set(0, 1.3 + tiers * 1.12 + 1.15, -0.09);
  group.add(star);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffd98a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  halo.scale.setScalar(2.6);
  halo.position.copy(star.position);
  group.add(halo);
  const light = new THREE.PointLight(0xffc880, 7, 14, 2);
  light.position.set(0, 4.5, 0);
  group.add(light);
  return { group, star, lights };
}

function plazaStarShape(): THREE.Shape {
  const starShape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 ? 0.28 : 0.6;
    const angle = (index / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  return starShape;
}

/* ---------------------------------------------------------------------- pole */

function buildPole(): { group: THREE.Group; beam: THREE.Mesh } {
  const group = new THREE.Group();
  for (let ring = 0; ring < 14; ring += 1) {
    const piece = cylinder({ radiusTop: 0.17, radiusBottom: 0.17, height: 0.42, segments: 10, material: matte(ring % 2 ? 0xffffff : COLORS.red, { roughness: 0.5 }) });
    piece.position.y = 0.21 + ring * 0.42;
    group.add(piece);
  }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2a1010, emissive: 0xff5a4a, emissiveIntensity: 2.4 }));
  globe.position.y = 6.2;
  group.add(globe);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#c23a3a';
    context.beginPath();
    context.arc(64, 64, 60, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 6;
    context.stroke();
    context.fillStyle = '#fff';
    context.font = '700 84px "Iowan Old Style", Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('N', 64, 70);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28), new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  badge.position.set(0, 5.5, 0.22);
  group.add(badge);
  const badgeBack = badge.clone();
  badgeBack.position.z = -0.22;
  badgeBack.rotation.y = Math.PI;
  group.add(badgeBack);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 1.2, 22, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 17;
  group.add(beam);
  const light = new THREE.PointLight(0xff6b5a, 6, 10, 2);
  light.position.y = 6.2;
  group.add(light);
  return { group, beam };
}

/* ----------------------------------------------------------------- elves, pond */

function elf(color: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 8), matte(color));
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), matte(0xf0c8a6));
  head.position.y = 0.98;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 8), matte(color));
  hat.position.y = 1.28;
  hat.rotation.z = 0.2;
  group.add(hat);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), matte(0xffffff));
  pom.position.set(0.1, 1.45, 0);
  group.add(pom);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12), matte(0xffffff));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.82;
  group.add(scarf);
  return group;
}

function buildPond(center: THREE.Vector3): { group: THREE.Group; update: (time: number) => void } {
  const group = new THREE.Group();
  group.position.copy(center);
  const ice = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.08, 40),
    new THREE.MeshStandardMaterial({ color: 0xa8dcf6, roughness: 0.12, metalness: 0.1, emissive: 0x2c6c92, emissiveIntensity: 0.55 }),
  );
  ice.position.y = 0.05;
  ice.scale.set(1.15, 1, 0.85);
  ice.receiveShadow = true;
  group.add(ice);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 6, 40), matte(COLORS.snow, { roughness: 1 }));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.15, 0.85, 1);
  rim.position.y = 0.1;
  group.add(rim);
  const skaters = [elf(COLORS.red), elf(COLORS.teal), elf(COLORS.gold)];
  skaters.forEach((skater) => group.add(skater));
  const update = (time: number) => {
    skaters.forEach((skater, index) => {
      const angle = time * (0.55 + index * 0.12) * (index % 2 ? -1 : 1) + index * 2.1;
      const radius = 1.5 + (index % 2) * 0.45;
      skater.position.set(Math.cos(angle) * radius * 1.15, 0.1, Math.sin(angle) * radius * 0.85);
      skater.rotation.y = -angle + (index % 2 ? 0 : Math.PI);
      skater.rotation.z = (index % 2 ? -1 : 1) * 0.16;
    });
  };
  return { group, update };
}

function buildWalkers(): { group: THREE.Group; update: (time: number) => void } {
  const group = new THREE.Group();
  const walkers = [elf(COLORS.green), elf(COLORS.red), elf(COLORS.blue), elf(0xc58ae8)];
  walkers.forEach((walker) => group.add(walker));
  const update = (time: number) => {
    walkers.forEach((walker, index) => {
      const speed = 0.16 + index * 0.025;
      const angle = time * speed * (index % 2 ? 1 : -1) + index * 1.6;
      const radius = 3.1 + (index % 2) * 0.7;
      walker.position.set(PLAZA.x + Math.cos(angle) * radius, Math.abs(Math.sin(time * 6 + index)) * 0.06, PLAZA.z + Math.sin(angle) * radius);
      walker.rotation.y = -angle + (index % 2 ? 0 : Math.PI) + Math.PI / 2 * (index % 2 ? -1 : 1);
    });
  };
  return { group, update };
}

/* -------------------------------------------------------------------- sky etc */

function buildSky(): { group: THREE.Group; update: (time: number) => void; moonDirection: THREE.Vector3 } {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(260, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 zenith = vec3(0.0006, 0.0025, 0.014);
          vec3 mid = vec3(0.003, 0.013, 0.055);
          vec3 horizon = vec3(0.012, 0.04, 0.11);
          vec3 glowLow = vec3(0.16, 0.07, 0.06);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.35, h));
          c = mix(c, zenith, smoothstep(0.3, 0.95, h));
          c += glowLow * 0.28 * pow(max(0.0, 1.0 - abs(h - 0.02) * 5.0), 2.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  group.add(dome);

  const random = seeded(5);
  const starCount = 1400;
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  for (let index = 0; index < starCount; index += 1) {
    const theta = random() * Math.PI * 2;
    const y = 0.05 + random() * 0.95;
    const radius = Math.sqrt(1 - y * y);
    positions.set([Math.cos(theta) * radius * 240, y * 240, Math.sin(theta) * radius * 240], index * 3);
    sizes[index] = 0.6 + random() * random() * 2.6;
    phases[index] = random() * 20;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  starGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float phase; uniform float uTime; varying float vTwinkle;
      void main(){ vTwinkle = 0.55 + 0.45 * sin(uTime * (1.2 + size * 0.5) + phase);
        gl_PointSize = size * (1.0 + 0.4 * vTwinkle) * 1.7;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying float vTwinkle;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.88), a * vTwinkle); }`,
  });
  group.add(new THREE.Points(starGeometry, starMaterial));

  const moonDirection = new THREE.Vector3(-0.5, 0.74, -0.45).normalize();
  const moonSpot = new THREE.Vector3(-46, 38, -150);
  const moonTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      const halo = context.createRadialGradient(128, 128, 20, 128, 128, 128);
      halo.addColorStop(0, 'rgba(210,225,255,0.55)');
      halo.addColorStop(0.35, 'rgba(160,190,255,0.16)');
      halo.addColorStop(1, 'rgba(160,190,255,0)');
      context.fillStyle = halo;
      context.fillRect(0, 0, 256, 256);
      const disc = context.createRadialGradient(112, 108, 6, 128, 128, 50);
      disc.addColorStop(0, '#ffffff');
      disc.addColorStop(1, '#e8e4d0');
      context.fillStyle = disc;
      context.beginPath();
      context.arc(128, 128, 48, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(170,166,148,0.38)';
      for (const [x, y, r] of [
        [112, 112, 11],
        [144, 140, 8],
        [120, 150, 6],
        [138, 106, 5],
      ] as const) {
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
      }
    }
    const texture = new THREE.CanvasTexture(context ? context.canvas : document.createElement('canvas'));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture, transparent: true, depthWrite: false, fog: false }));
  moon.scale.setScalar(70);
  moon.position.copy(moonSpot);
  group.add(moon);

  const ribbons: THREE.Mesh[] = [];
  const ribbonMaterials: THREE.ShaderMaterial[] = [];
  const auroraSpecs = [
    { y: 36, z: -128, color: new THREE.Color(0x4dffb8), alt: new THREE.Color(0x5ab8ff), speed: 0.12, scale: 1.0 },
    { y: 46, z: -140, color: new THREE.Color(0x9b7bff), alt: new THREE.Color(0x4dffd0), speed: 0.09, scale: 1.2 },
    { y: 30, z: -118, color: new THREE.Color(0x8dff9a), alt: new THREE.Color(0x4dd7ff), speed: 0.15, scale: 0.9 },
  ];
  auroraSpecs.forEach((spec, index) => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: spec.color }, uAlt: { value: spec.alt }, uSeed: { value: index * 3.7 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSeed; varying vec2 vUv;
        void main(){ vUv = uv; vec3 p = position;
          p.y += sin(p.x * 0.045 + uTime * 0.6 + uSeed) * 9.0 + sin(p.x * 0.11 + uTime * 0.9) * 3.0;
          p.z += sin(p.x * 0.03 + uSeed) * 18.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uAlt; uniform float uTime; uniform float uSeed; varying vec2 vUv;
        void main(){
          float fall = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.18, vUv.y);
          float curtain = 0.55 + 0.45 * sin(vUv.x * 60.0 + uTime * 0.8 + uSeed) * sin(vUv.x * 23.0 - uTime * 0.5);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          vec3 c = mix(uColor, uAlt, vUv.y);
          gl_FragColor = vec4(c * (0.55 + curtain * 0.7), fall * curtain * edge * 0.5);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(330 * spec.scale, 40, 120, 1), material);
    mesh.position.set(index * 20 - 20, spec.y, spec.z);
    mesh.rotation.x = 0.1;
    group.add(mesh);
    ribbons.push(mesh);
    ribbonMaterials.push(material);
  });

  const update = (time: number) => {
    starMaterial.uniforms.uTime!.value = time;
    ribbonMaterials.forEach((material) => {
      material.uniforms.uTime!.value = time;
    });
  };
  return { group, update, moonDirection };
}

function buildMountains(): THREE.Group {
  const group = new THREE.Group();
  const random = seeded(31);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6a9c, roughness: 0.9, flatShading: true });
  const snowMaterial = matte(0xdfe9f7, { roughness: 1 });
  for (let index = 0; index < 34; index += 1) {
    const angle = (index / 34) * Math.PI * 2 + random() * 0.15;
    const distance = 78 + random() * 34;
    const height = 12 + random() * 24;
    const radius = 9 + random() * 12;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6 + Math.floor(random() * 3)), rockMaterial);
    rock.position.set(Math.cos(angle) * distance, height / 2 - 8, Math.sin(angle) * distance * 0.9);
    rock.rotation.y = random() * 3;
    group.add(rock);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.46, height * 0.34, 6), snowMaterial);
    cap.position.set(rock.position.x, rock.position.y + height * 0.34, rock.position.z);
    cap.rotation.y = rock.rotation.y;
    group.add(cap);
  }
  return group;
}

/* -------------------------------------------------------------- particle fields */

function buildSnowfall(): { points: THREE.Points; update: (time: number) => void } {
  const random = seeded(3);
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions.set([(random() - 0.5) * 56, random() * 22, (random() - 0.5) * 56], index * 3);
    seeds[index] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: softDotTexture() } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; varying float vAlpha;
      void main(){
        vec3 p = position;
        float fall = mod(p.y - uTime * (0.9 + seed * 1.4), 22.0);
        p.y = fall;
        p.x += sin(uTime * 0.5 + seed * 40.0) * 0.7 + uTime * 0.18 * (0.4 + seed);
        p.x = mod(p.x + 28.0, 56.0) - 28.0;
        p.z += cos(uTime * 0.4 + seed * 31.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vAlpha = smoothstep(0.0, 2.0, fall) * smoothstep(22.0, 18.0, fall) * (0.5 + seed * 0.5);
        gl_PointSize = (1.6 + seed * 3.6) * (40.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vAlpha;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), t.a * vAlpha); }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, update: (time) => (material.uniforms.uTime!.value = time) };
}

function buildSmoke(origins: THREE.Vector3[]): { points: THREE.Points; update: (time: number) => void } {
  const perChimney = 16;
  const count = origins.length * perChimney;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  origins.forEach((origin, chimneyIndex) => {
    for (let index = 0; index < perChimney; index += 1) {
      const slot = chimneyIndex * perChimney + index;
      positions.set([origin.x, origin.y, origin.z], slot * 3);
      phases[slot] = index / perChimney + chimneyIndex * 0.13;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: softDotTexture() } },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float uTime; varying float vAlpha;
      void main(){
        float life = fract(uTime * 0.11 + phase);
        vec3 p = position;
        p.y += life * 3.4;
        p.x += sin(life * 5.0 + phase * 20.0) * 0.35 * life + life * life * 1.1;
        p.z += cos(life * 4.0 + phase * 12.0) * 0.25 * life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vAlpha = sin(life * 3.14159) * 0.38;
        gl_PointSize = (14.0 + life * 46.0) * (42.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vAlpha;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.86, 0.9, 0.95), t.a * vAlpha); }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, update: (time) => (material.uniforms.uTime!.value = time) };
}

function buildSleighTrail(): { points: THREE.Points; emit: (position: THREE.Vector3, time: number) => void; update: (time: number) => void } {
  const count = 140;
  const positions = new Float32Array(count * 3).fill(9999);
  const born = new Float32Array(count).fill(-100);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('born', new THREE.BufferAttribute(born, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: softDotTexture() } },
    vertexShader: /* glsl */ `
      attribute float born; uniform float uTime; varying float vAge;
      void main(){ vAge = clamp((uTime - born) / 2.6, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.0 - vAge) * 20.0 * (60.0 / -mv.z) + 2.0;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vAge;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 c = mix(vec3(1.0, 0.92, 0.6), vec3(0.6, 0.8, 1.0), vAge);
        gl_FragColor = vec4(c * 1.6, t.a * (1.0 - vAge)); }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let cursor = 0;
  return {
    points,
    emit: (position, time) => {
      const jitter = 0.35;
      positions.set([position.x + (Math.random() - 0.5) * jitter, position.y + (Math.random() - 0.5) * jitter, position.z + (Math.random() - 0.5) * jitter], cursor * 3);
      born[cursor] = time;
      cursor = (cursor + 1) % count;
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.born!.needsUpdate = true;
    },
    update: (time) => (material.uniforms.uTime!.value = time),
  };
}

/* --------------------------------------------------------------------- world */

function addIslandFigures(island: THREE.Group): ReturnType<typeof twinkle> {
  const snowmen: [number, number, number][] = [[-3.2, 5.6, 0.5], [2.0, -1.8, -0.4]];
  for (const [x, z, rotation] of snowmen) {
    const figure = snowman();
    figure.position.set(x, 0, z);
    figure.rotation.y = rotation;
    island.add(figure);
  }
  const lampSpots: [number, number][] = [[-3.4, -1.6], [3.6, -1.2], [-1.8, 5.2], [1.6, 5.6], [-5.2, 2.2], [5.6, 1.4]];
  const lampLightPoints: TwinkleOptions['points'] = [];
  for (const [x, z] of lampSpots) {
    const post = lampPost(1.9);
    post.position.set(x, 0, z);
    island.add(post);
    lampLightPoints.push({ position: new THREE.Vector3(x, 2.05, z), color: new THREE.Color(0xffc980), phase: x + z });
  }
  const lampGlow = twinkle({ size: 40, points: lampLightPoints });
  island.add(lampGlow.points);
  return lampGlow;
}

function addBuildingEffects(island: THREE.Group, buildings: Building[]): { points: THREE.Points; update: (time: number) => void } {
  const smokeOrigins: THREE.Vector3[] = [];
  for (const building of buildings) {
    building.group.updateMatrixWorld(true);
    building.smoke.forEach((local) => smokeOrigins.push(building.group.localToWorld(local.clone())));
    building.lights.forEach((light) => building.group.add(light));
  }
  const smoke = buildSmoke(smokeOrigins);
  island.add(smoke.points);
  return smoke;
}

function buildStringLights(island: THREE.Group): ReturnType<typeof twinkle> {
  const stringPoints: TwinkleOptions['points'] = [];
  const random = seeded(19);
  const bulbPalette = [0xff5a5a, 0xffd166, 0x66d3ff, 0x8affb0, 0xffa0e8].map((value) => new THREE.Color(value));
  const strings: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-9.4, 3.4, -2.6), new THREE.Vector3(-3.4, 2.2, -1.6)],
    [new THREE.Vector3(9.2, 3.4, -3.2), new THREE.Vector3(3.6, 2.2, -1.2)],
    [new THREE.Vector3(-3.4, 2.2, -1.6), new THREE.Vector3(0, 3.6, -6.0)],
    [new THREE.Vector3(3.6, 2.2, -1.2), new THREE.Vector3(0, 3.6, -6.0)],
    [new THREE.Vector3(-5.2, 2.2, 2.2), new THREE.Vector3(-1.8, 2.2, 5.2)],
    [new THREE.Vector3(5.6, 2.2, 1.4), new THREE.Vector3(1.6, 2.2, 5.6)],
  ];
  strings.forEach(([a, b], stringIndex) => {
    const segments = 14;
    const curvePoints: THREE.Vector3[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const point = a.clone().lerp(b, t);
      point.y -= Math.sin(t * Math.PI) * 0.6;
      curvePoints.push(point);
      if (index > 0 && index < segments) stringPoints.push({ position: point, color: bulbPalette[(index + stringIndex) % bulbPalette.length] ?? bulbPalette[0]!, phase: random() * 9 });
    }
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePoints), new THREE.LineBasicMaterial({ color: 0x14121c }));
    island.add(wire);
  });
  const stringLights = twinkle({ size: 9, points: stringPoints });
  island.add(stringLights.points);
  return stringLights;
}

function buildFlightPath(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-30, 13, -4), new THREE.Vector3(-18, 16, -20),
      new THREE.Vector3(2, 18, -26), new THREE.Vector3(22, 15, -14),
      new THREE.Vector3(30, 12, 4), new THREE.Vector3(18, 14, 22),
      new THREE.Vector3(-4, 17, 28), new THREE.Vector3(-22, 14, 18),
    ],
    true,
    'catmullrom',
    0.5,
  );
}

function addWorldLighting(root: THREE.Group, sky: ReturnType<typeof buildSky>): THREE.DirectionalLight {
  const moon = new THREE.DirectionalLight(0xb4cbff, 2.2);
  moon.position.copy(sky.moonDirection).multiplyScalar(40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const shadowCamera = moon.shadow.camera;
  shadowCamera.left = -20;
  shadowCamera.right = 20;
  shadowCamera.top = 20;
  shadowCamera.bottom = -20;
  shadowCamera.near = 5;
  shadowCamera.far = 100;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.04;
  root.add(moon);
  root.add(new THREE.HemisphereLight(0x7f9cf0, 0x2c3b6c, 1.05));
  return moon;
}

export function createWorld(): World {
  const root = new THREE.Group();
  const buildings = createBuildings();

  const sky = buildSky();
  root.add(sky.group);
  root.add(buildMountains());

  const island = new THREE.Group();
  island.add(buildIsland());
  island.add(buildPaths(buildings));
  buildings.forEach((building) => island.add(building.group));
  island.add(buildForest(buildings));
  root.add(island);

  const tree = buildPlazaTree();
  tree.group.position.set(PLAZA.x, 0, PLAZA.z);
  tree.group.scale.setScalar(0.62);
  island.add(tree.group);

  const pole = buildPole();
  pole.group.position.set(3.7, 0, 3.0);
  island.add(pole.group);

  const pond = buildPond(new THREE.Vector3(4.6, 0.0, 7.6));
  island.add(pond.group);
  const walkers = buildWalkers();
  island.add(walkers.group);

  const lampGlow = addIslandFigures(island);
  const smoke = addBuildingEffects(island, buildings);

  const stringLights = buildStringLights(island);

  const snow = buildSnowfall();
  root.add(snow.points);

  const sleigh = createSleigh();
  sleigh.group.scale.setScalar(1.15);
  root.add(sleigh.group);
  const trail = buildSleighTrail();
  root.add(trail.points);
  const flightPath = buildFlightPath();
  const moon = addWorldLighting(root, sky);

  const sleighPosition = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);
  let lastEmit = 0;
  const update = (time: number, delta: number) => {
    sky.update(time);
    snow.update(time);
    smoke.update(time);
    trail.update(time);
    stringLights.material.uniforms.uTime!.value = time;
    tree.lights.material.uniforms.uTime!.value = time;
    lampGlow.material.uniforms.uTime!.value = time;
    pond.update(time);
    walkers.update(time);
    buildings.forEach((building) => building.animate(time, delta));
    (pole.beam.material as THREE.MeshBasicMaterial).opacity = 0.045 + Math.sin(time * 1.5) * 0.02;
    tree.star.rotation.y = Math.sin(time * 0.8) * 0.5;

    const flight = (time * 0.0205 + 0.1) % 1;
    flightPath.getPointAt(flight, sleighPosition);
    flightPath.getTangentAt(flight, tangent);
    sleigh.group.position.copy(sleighPosition);
    sleigh.group.position.y += Math.sin(time * 1.3) * 0.35;
    const target = sleighPosition.clone().add(tangent);
    sleigh.group.lookAt(target);
    sleigh.group.rotateZ(Math.sin(time * 0.9) * 0.1);
    sleigh.group.up.copy(upVector);
    sleigh.update(time);
    if (time - lastEmit > 0.03) {
      lastEmit = time;
      const origin = new THREE.Vector3();
      sleigh.trailOrigin.getWorldPosition(origin);
      trail.emit(origin, time);
    }
  };
  return { root, buildings, update, moon, sleighPosition: () => sleighPosition };
}
