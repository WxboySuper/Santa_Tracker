import * as THREE from 'three';
import { isSharedMaterial } from '../village/village-kit';

/** What a mini scene hands back once it has built its objects. */
export type SceneRig = {
  update: (time: number, delta: number) => void;
  /** Optional: point the model along a map bearing, in radians clockwise from north. */
  setHeading?: (bearing: number) => void;
};

export type MiniSceneSpec = {
  /** CSS pixel size of the square canvas. */
  size: number;
  fov: number;
  cameraPosition: readonly [number, number, number];
  cameraTarget: readonly [number, number, number];
  build: (scene: THREE.Scene) => SceneRig;
  reducedMotion: boolean;
  onLost: () => void;
};

export type MiniScene = {
  rig: SceneRig;
  dispose: () => void;
};

const FRAME_MS = 1000 / 30;
const STILL_TIME = 2.4;

function createRenderer(canvas: HTMLCanvasElement, size: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function createCamera(spec: MiniSceneSpec): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(spec.fov, 1, 0.1, 80);
  camera.position.set(...spec.cameraPosition);
  camera.lookAt(...spec.cameraTarget);
  return camera;
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x35405e, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2);
  key.position.set(4, 8, 6);
  scene.add(key);
}

type Loop = { stop: () => void };

function startLoop(frame: (time: number, delta: number) => void): Loop {
  let handle = 0;
  let last = 0;
  let started = 0;
  const tick = (now: number) => {
    handle = requestAnimationFrame(tick);
    if (document.hidden || now - last < FRAME_MS) return;
    if (!started) started = now;
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame((now - started) / 1000, delta);
  };
  handle = requestAnimationFrame(tick);
  return { stop: () => cancelAnimationFrame(handle) };
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    materials.filter((entry) => !isSharedMaterial(entry)).forEach((entry) => entry.dispose());
  });
}

/** Mounts a small transparent WebGL scene into a canvas. Returns null if WebGL is unavailable. */
export function mountMiniScene(canvas: HTMLCanvasElement, spec: MiniSceneSpec): MiniScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer(canvas, spec.size);
  } catch {
    return null;
  }
  const scene = new THREE.Scene();
  const camera = createCamera(spec);
  addLights(scene);
  const rig = spec.build(scene);
  const render = (time: number, delta: number) => {
    rig.update(time, delta);
    renderer.render(scene, camera);
  };
  const lost = (event: Event) => {
    event.preventDefault();
    spec.onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);
  const loop = spec.reducedMotion ? null : startLoop(render);
  if (!loop) render(STILL_TIME, 0);
  return {
    rig,
    dispose: () => {
      loop?.stop();
      canvas.removeEventListener('webglcontextlost', lost);
      disposeScene(scene);
      renderer.dispose();
    },
  };
}
