import type Map from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import type { Scene } from 'three';
import { POLE_COORD } from '../../lib/tracker-polar-cap';
import { mountMiniScene, type MiniScene, type SceneRig } from './mini-scene';
import { buildPoleScene } from './pole-scene';


type Piece = {
  overlay: Overlay;
  scene: MiniScene;
};

type PieceSpec = {
  size: number;
  fov: number;
  cameraPosition: readonly [number, number, number];
  cameraTarget: readonly [number, number, number];
  offset: [number, number];
  build: (scene: Scene) => SceneRig;
};

const POLE: PieceSpec = { size: 300, fov: 44, cameraPosition: [0, 5.0, 15.5], cameraTarget: [0, 3.3, 0], offset: [0, -78], build: buildPoleScene };

function canvasElement(size: number): { wrapper: HTMLDivElement; canvas: HTMLCanvasElement } {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.pointerEvents = 'none';
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.pointerEvents = 'none';
  wrapper.appendChild(canvas);
  return { wrapper, canvas };
}

/**
 * The 3D North Pole station above the map. Santa himself is a small 2D storybook sleigh drawn by the map layer,
 * so he reads as a marker at every zoom.
 */
export class TrackerArt {
  private pole?: Piece;

  constructor(private readonly map: Map) {}

  mount(): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { wrapper, canvas } = canvasElement(POLE.size);
    const scene = mountMiniScene(canvas, { ...POLE, reducedMotion, onLost: () => this.dispose() });
    if (!scene) return;
    const overlay = new Overlay({ element: wrapper, positioning: 'center-center', offset: POLE.offset, stopEvent: false });
    overlay.setPosition(POLE_COORD);
    this.map.addOverlay(overlay);
    this.pole = { overlay, scene };
  }

  dispose(): void {
    if (!this.pole) return;
    this.map.removeOverlay(this.pole.overlay);
    this.pole.scene.dispose();
    this.pole = undefined;
  }
}
