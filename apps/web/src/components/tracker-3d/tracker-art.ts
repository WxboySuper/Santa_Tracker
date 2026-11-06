import type Map from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import type { Scene } from 'three';
import { fromLonLat } from 'ol/proj.js';
import { POLE_COORD } from '../../lib/tracker-polar-cap';
import { mountMiniScene, type MiniScene, type SceneRig } from './mini-scene';
import { buildPoleScene } from './pole-scene';
import { buildSleighScene } from './sleigh-scene';


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
const SLEIGH: PieceSpec = { size: 200, fov: 24, cameraPosition: [0, 12.5, 10.5], cameraTarget: [0, 0, 0.5], offset: [0, 0], build: buildSleighScene };

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

/** Custom 3D map elements: the North Pole station and the sleigh marker. */
export class TrackerArt {
  private pole?: Piece;
  private sleigh?: Piece;
  private lost = false;

  constructor(
    private readonly map: Map,
    private readonly onSleighLost: () => void,
  ) {}

  /** True once the sleigh is drawn in 3D, so the plain dot can be dropped. */
  get sleighReady(): boolean {
    return Boolean(this.sleigh) && !this.lost;
  }

  mount(): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pole = this.piece(POLE, POLE_COORD, reducedMotion, () => this.removePole());
    this.sleigh = this.piece(SLEIGH, undefined, reducedMotion, () => this.loseSleigh());
  }

  private piece(spec: PieceSpec, coordinate: [number, number] | undefined, reducedMotion: boolean, onLost: () => void): Piece | undefined {
    const { wrapper, canvas } = canvasElement(spec.size);
    const scene = mountMiniScene(canvas, { ...spec, reducedMotion, onLost });
    if (!scene) return undefined;
    const overlay = new Overlay({ element: wrapper, positioning: 'center-center', offset: spec.offset, stopEvent: false });
    if (coordinate) overlay.setPosition(coordinate);
    this.map.addOverlay(overlay);
    return { overlay, scene };
  }

  setSleigh(lonLat: [number, number], bearing: number): void {
    if (!this.sleigh) return;
    this.sleigh.overlay.setPosition(fromLonLat(lonLat));
    this.sleigh.scene.rig.setHeading?.(bearing);
  }

  private removePole(): void {
    this.drop(this.pole);
    this.pole = undefined;
  }

  private loseSleigh(): void {
    this.lost = true;
    this.drop(this.sleigh);
    this.sleigh = undefined;
    this.onSleighLost();
  }

  private drop(piece: Piece | undefined): void {
    if (!piece) return;
    this.map.removeOverlay(piece.overlay);
    piece.scene.dispose();
  }

  dispose(): void {
    this.drop(this.pole);
    this.drop(this.sleigh);
    this.pole = undefined;
    this.sleigh = undefined;
  }
}
