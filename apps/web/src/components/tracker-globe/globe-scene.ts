import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { interpolateGreatCircle } from '@santa-tracker/route-engine';
import type { RouteNode } from '../../lib/locations';
import type { SantaPosition } from '../../lib/tracker-position';
import type { TrackerTheme } from '../../lib/tracker-theme';
import { bearingBetween } from '../../lib/tracker-map-geometry';
import { headingWest, sleighImage } from '../../lib/tracker-sleigh-icon';

type LatLng = { lat: number; lng: number };

const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;
const FOLLOW_DISTANCE = 2.35;

/** Unit-sphere direction for a latitude and longitude, matching SphereGeometry's texture layout. */
export function toVector({ lat, lng }: LatLng, radius = 1): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda)).multiplyScalar(radius);
}

/** The point on Earth directly under the sun at a given instant (declination is about -23.4° at Christmas). */
export function subsolarPoint(at: Date): LatLng {
  const dayOfYear = Math.floor((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - Date.UTC(at.getUTCFullYear(), 0, 0)) / 86_400_000);
  const declination = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180);
  const hours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  return { lat: declination, lng: -(hours - 12) * 15 };
}

type Topology = { transform: { scale: [number, number]; translate: [number, number] }; arcs: [number, number][][]; objects: { land: { geometries: { type: string; arcs: number[][] | number[][][] }[] } } };

function decodeArcs(topology: Topology): [number, number][][] {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map(arc => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty] as [number, number];
    });
  });
}

function landRings(topology: Topology): [number, number][][] {
  const arcs = decodeArcs(topology);
  const arcAt = (index: number) => (index < 0 ? [...(arcs[~index] ?? [])].reverse() : arcs[index] ?? []);
  const rings: [number, number][][] = [];
  for (const geometry of topology.objects.land.geometries) {
    const polygons = (geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs) as number[][][];
    for (const polygon of polygons) {
      for (const ring of polygon) rings.push(ring.flatMap((index, i) => (i ? arcAt(index).slice(1) : arcAt(index))));
    }
  }
  return rings;
}

/** Paints the globe texture: water, land, and a faint graticule, in the theme's map colours. */
function paintTexture(theme: TrackerTheme, rings: [number, number][][] | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.fillStyle = theme.map.water;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const x = (lng: number) => ((lng + 180) / 360) * TEXTURE_WIDTH;
  const y = (lat: number) => ((90 - lat) / 180) * TEXTURE_HEIGHT;
  context.strokeStyle = theme.map.border;
  context.globalAlpha = 0.18;
  context.lineWidth = 1;
  for (let lng = -180; lng <= 180; lng += 30) { context.beginPath(); context.moveTo(x(lng), 0); context.lineTo(x(lng), TEXTURE_HEIGHT); context.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { context.beginPath(); context.moveTo(0, y(lat)); context.lineTo(TEXTURE_WIDTH, y(lat)); context.stroke(); }
  context.globalAlpha = 1;
  if (!rings) return canvas;
  context.beginPath();
  for (const ring of rings) {
    ring.forEach(([lng, lat], i) => (i ? context.lineTo(x(lng), y(lat)) : context.moveTo(x(lng), y(lat))));
    context.closePath();
  }
  context.fillStyle = theme.map.land;
  context.fill('evenodd');
  context.strokeStyle = theme.map.border;
  context.globalAlpha = Math.min(1, theme.map.borderOpacity + 0.2);
  context.lineWidth = 1.2;
  context.stroke();
  context.globalAlpha = 1;
  return canvas;
}

function glowTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function starField(): THREE.Points {
  const positions = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
    positions.set([v.x, v.y, v.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
}

function arcPoints(from: LatLng, to: LatLng, radius: number): THREE.Vector3[] {
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, i) => toVector(interpolateGreatCircle(from, to, i / steps), radius));
}

export interface GlobeHandle {
  setRoute(nodes: RouteNode[]): void;
  setPosition(position: SantaPosition | null, now: Date): void;
  follow(): void;
  visitPole(): void;
  dispose(): void;
}

/** A three.js globe that draws the route, darkens the night side, and keeps Santa in view. */
export function createGlobe(canvas: HTMLCanvasElement, theme: TrackerTheme, onStopFollowing: () => void): GlobeHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  camera.position.set(0, 0.6, FOLLOW_DISTANCE);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.35;
  controls.maxDistance = 6;
  controls.rotateSpeed = 0.5;

  scene.add(starField());
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  scene.add(sun);

  const texture = new THREE.CanvasTexture(paintTexture(theme, null));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshLambertMaterial({ map: texture }));
  scene.add(earth);

  let disposed = false;
  fetch(LAND_URL)
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((topology: Topology) => {
      if (disposed) return;
      texture.image = paintTexture(theme, landRings(topology));
      texture.needsUpdate = true;
    })
    .catch(() => undefined); // Keep the plain ocean globe; the route still reads.

  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  const flownMaterial = new THREE.LineBasicMaterial({ color: theme.trail.flown, transparent: true, opacity: 0.95 });
  const aheadMaterial = new THREE.LineBasicMaterial({ color: theme.trail.stopAheadStroke, transparent: true, opacity: 0.45 });
  const stopGeometry = new THREE.SphereGeometry(0.0045, 8, 6);
  const doneMaterial = new THREE.MeshBasicMaterial({ color: theme.trail.stopDone });
  const aheadStopMaterial = new THREE.MeshBasicMaterial({ color: theme.trail.stopAheadStroke, transparent: true, opacity: 0.7 });

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(theme.trail.flown), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(0.16, 0.16, 1);
  const sleighMaterials = { east: new THREE.SpriteMaterial({ transparent: true, depthWrite: false }), west: new THREE.SpriteMaterial({ transparent: true, depthWrite: false }) };
  for (const [key, material] of Object.entries(sleighMaterials)) {
    const loader = new THREE.TextureLoader();
    loader.load(sleighImage(theme.marker, key === 'west'), loaded => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      material.map = loaded;
      material.needsUpdate = true;
    });
  }
  const sleigh = new THREE.Sprite(sleighMaterials.east);
  sleigh.scale.set(0.1, 0.047, 1);
  sleigh.visible = false;
  glow.visible = false;
  scene.add(glow, sleigh);

  let nodes: RouteNode[] = [];
  let reachedIndex = -2;
  let following = true;
  let santa: THREE.Vector3 | null = null;
  const stopFollowing = () => {
    if (!following) return;
    following = false;
    onStopFollowing();
  };
  controls.addEventListener('start', stopFollowing);

  const activeGroup = new THREE.Group();
  scene.add(activeGroup);
  // Arcs come in 25-point runs; pairing consecutive points inside each run keeps separate legs from joining.
  const pairs = (points: THREE.Vector3[]) => points.flatMap((point, i) => (i % 25 === 24 || i === points.length - 1 ? [] : [point, points[i + 1]!]));
  const addLines = (group: THREE.Group, points: THREE.Vector3[], material: THREE.LineBasicMaterial) => {
    const paired = pairs(points);
    if (paired.length >= 2) group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(paired), material));
  };
  const clear = (group: THREE.Group) => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.LineSegments) (child.geometry as THREE.BufferGeometry).dispose();
    }
  };

  /** Every leg except the one Santa is flying, plus the stop dots. Redrawn only when he reaches a stop. */
  const drawStatic = (reached: number) => {
    clear(routeGroup);
    const flown: THREE.Vector3[] = [];
    const ahead: THREE.Vector3[] = [];
    nodes.forEach((node, index) => {
      const previous = nodes[index - 1];
      if (previous && index !== reached + 1) (index <= reached ? flown : ahead).push(...arcPoints(previous.location, node.location, 1.002));
      if (node.type !== 'DELIVERY') return;
      const dot = new THREE.Mesh(stopGeometry, index <= reached ? doneMaterial : aheadStopMaterial);
      dot.position.copy(toVector(node.location, 1.003));
      routeGroup.add(dot);
    });
    addLines(routeGroup, flown, flownMaterial);
    addLines(routeGroup, ahead, aheadMaterial);
  };

  /** The leg in progress, split at Santa: flown behind him, dotted ahead. Redrawn every update. */
  const drawActive = (reached: number, position: LatLng) => {
    clear(activeGroup);
    const from = nodes[reached];
    const to = nodes[reached + 1];
    if (!from || !to) return;
    addLines(activeGroup, arcPoints(from.location, position, 1.002), flownMaterial);
    addLines(activeGroup, arcPoints(position, to.location, 1.002), aheadMaterial);
  };

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let frame = 0;
  const target = new THREE.Vector3();
  const tick = () => {
    frame = requestAnimationFrame(tick);
    if (following && santa) {
      const distance = camera.position.length();
      target.copy(santa).normalize().multiplyScalar(distance);
      target.y += 0.25 * (distance - 1); // Look slightly down on Santa, from the north.
      target.setLength(distance);
      // Lerping between two points on a sphere cuts the chord, so restore the distance or the camera creeps inward.
      camera.position.lerp(target, 0.06).setLength(distance);
    }
    controls.update();
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  return {
    setRoute(next) {
      nodes = next;
      reachedIndex = -2;
    },
    setPosition(position, now) {
      sun.position.copy(toVector(subsolarPoint(now), 10));
      if (!position) {
        sleigh.visible = glow.visible = false;
        return;
      }
      const reached = position.journey.currentIndex ?? -1;
      if (reached !== reachedIndex) {
        reachedIndex = reached;
        drawStatic(reached);
      }
      drawActive(reached, position);
      santa = toVector(position, 1.02);
      sleigh.position.copy(santa);
      glow.position.copy(toVector(position, 1.01));
      const next = nodes[reached + 1];
      sleigh.material = next && headingWest(bearingBetween(position, next.location)) ? sleighMaterials.west : sleighMaterials.east;
      sleigh.visible = glow.visible = true;
    },
    follow() {
      following = true;
    },
    visitPole() {
      stopFollowing();
      camera.position.set(0, 2.2, 0.9);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      texture.dispose();
    },
  };
}
