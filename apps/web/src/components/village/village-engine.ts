import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Building, BuildingId } from './village-buildings';
import { PLAZA, createWorld, type World } from './village-world';

export type EngineEvents = {
  onFail: () => void;
  /** The canvas still reads as blank in the plainest mode: likely a privacy setting hiding it. */
  onBlocked: () => void;
  onHover: (id: BuildingId | null, anchor: { x: number; y: number } | null) => void;
  onSelect: (id: BuildingId | null) => void;
  onReady: () => void;
};

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  events: EngineEvents;
};

type Pose = { yaw: number; pitch: number; distance: number; target: THREE.Vector3 };

const HOME: Pose = { yaw: 0.46, pitch: 0.36, distance: 47, target: new THREE.Vector3(0, 3.6, 0.2) };
const damp = (current: number, target: number, rate: number, delta: number) => current + (target - current) * (1 - Math.exp(-rate * delta));

/**
 * The renderer, camera rig, picking and the frame loop. It owns every WebGL resource and releases
 * them in dispose(), so mounting and unmounting the page leaks nothing.
 */
export class VillageEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 700);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  /** high: HDR bloom. low: 8-bit bloom for GPUs without float targets. basic: plain render, no post-processing. */
  private mode: 'high' | 'low' | 'basic' = 'high';
  private blackChecks = 0;
  private readonly world: World;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(9, 9);
  private readonly timer = new THREE.Timer();
  private readonly pose: Pose = { ...HOME, target: HOME.target.clone() };
  private readonly goal: Pose = { ...HOME, target: HOME.target.clone() };
  private readonly idle = { x: 0, y: 0 };
  private readonly events: EngineEvents;
  private readonly reducedMotion: boolean;
  private frame = 0;
  private running = false;
  private hovered: Building | null = null;
  private selected: Building | null = null;
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  private lastInteraction = 0;
  private pixelRatio = 1;
  private slowFrames = 0;
  private readonly listeners: (() => void)[] = [];
  private debugPose: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private shift = 0;

  constructor({ canvas, reducedMotion, events }: EngineOptions) {
    this.events = events;
    this.reducedMotion = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.scene.background = new THREE.Color(0x07122c);
    this.scene.fog = new THREE.FogExp2(0x0c1f45, 0.0058);
    this.world = createWorld();
    this.scene.add(this.world.root);

    this.mode = this.chooseMode();
    this.buildComposer();
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.listeners.push(() => canvas.removeEventListener('webglcontextlost', this.onContextLost));

    this.bindEvents(canvas);
    this.resize();
    this.applyCamera(1);
    this.lastInteraction = performance.now();
  }

  /* ----------------------------------------------------------------- public */

  get buildings(): Building[] {
    return this.world.buildings;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    this.frame = requestAnimationFrame(this.tick);
    this.events.onReady();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Development aid: place the camera anywhere, or pass null to return to the rig. */
  debugView(position: [number, number, number] | null, target: [number, number, number] = [0, 0, 0]): void {
    this.debugPose = position ? { position: new THREE.Vector3(...position), target: new THREE.Vector3(...target) } : null;
  }

  sleighPosition(): [number, number, number] {
    const point = this.world.sleighPosition();
    return [point.x, point.y, point.z];
  }

  setPlaying(playing: boolean): void {
    this.world.buildings.find((building) => building.id === 'music')?.setPlaying?.(playing);
  }

  select(id: BuildingId | null): void {
    const building = id ? (this.world.buildings.find((entry) => entry.id === id) ?? null) : null;
    this.selected = building;
    this.lastInteraction = performance.now();
    if (!building) {
      this.goal.yaw = HOME.yaw;
      this.goal.pitch = HOME.pitch;
      this.goal.distance = HOME.distance;
      this.goal.target.copy(HOME.target);
    } else {
      const position = building.group.position;
      const tall = id === 'tower' || id === 'observatory';
      this.goal.target.set(position.x, tall ? 3.6 : 1.9, position.z);
      this.goal.distance = tall ? 24 : id === 'workshop' ? 23 : 19;
      this.goal.pitch = tall ? 0.3 : id === 'workshop' ? 0.52 : 0.34;
      const toPlaza = Math.atan2(PLAZA.x - position.x, PLAZA.z - position.z);
      this.goal.yaw = THREE.MathUtils.clamp(toPlaza * 0.5, -0.9, 0.9) + 0.32;
    }
    this.events.onSelect(id);
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const ratio = this.safePixelRatio(width, height);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.fov = width / height < 0.8 ? 56 : width / height < 1.2 ? 46 : 38;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The drawing buffer must fit the GPU's limits on every side (some browsers report small limits
   * for privacy) and a sane pixel budget, otherwise part of the picture silently goes missing on
   * very wide or high-density screens.
   */
  private safePixelRatio(width: number, height: number): number {
    const gl = this.renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
    const limits = [gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), viewport?.[0], viewport?.[1]]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    const maxSide = Math.min(...limits, 16384);
    const byLimit = maxSide / Math.max(width, height);
    const byBudget = Math.sqrt(4_200_000 / (width * height));
    return Math.max(0.5, Math.min(this.pixelRatio, byLimit, byBudget));
  }

  dispose(): void {
    this.stop();
    this.listeners.forEach((remove) => remove());
    this.scene.traverse((object) => {
      const renderable = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      renderable.geometry?.dispose();
      const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
      materials.forEach((material) => material.dispose());
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }

  /* ----------------------------------------------------------------- input */

  private bindEvents(canvas: HTMLCanvasElement): void {
    const add = (target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler as EventListener, options);
      this.listeners.push(() => target.removeEventListener(type, handler as EventListener));
    };
    add(canvas, 'pointerdown', (event: PointerEvent) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    add(canvas, 'pointermove', (event: PointerEvent) => {
      this.lastInteraction = performance.now();
      const rect = canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (this.selected) return;
      this.goal.yaw = THREE.MathUtils.clamp(this.goal.yaw - dx * 0.004, -0.9, 1.5);
      this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * 0.003, 0.34, 0.95);
    });
    add(canvas, 'pointerup', (event: PointerEvent) => {
      this.dragging = false;
      canvas.releasePointerCapture(event.pointerId);
      if (this.dragMoved < 6) this.click();
    });
    add(canvas, 'pointerleave', () => {
      this.pointer.set(9, 9);
    });
    add(canvas, 'wheel', (event: WheelEvent) => {
      if (this.selected) return;
      event.preventDefault();
      this.goal.distance = THREE.MathUtils.clamp(this.goal.distance + event.deltaY * 0.03, 36, 74);
      this.lastInteraction = performance.now();
    }, { passive: false });
    add(window, 'resize', () => this.resize());
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(canvas);
    this.listeners.push(() => observer.disconnect());
    add(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.running) this.timer.update();
    });
  }

  private pick(): Building | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.buildings.map((building) => building.hit), false);
    const first = hits[0];
    return first ? (this.world.buildings.find((building) => building.hit === first.object) ?? null) : null;
  }

  private click(): void {
    const building = this.pick();
    if (building) this.select(building.id);
    else if (this.selected) this.select(null);
  }

  /* ----------------------------------------------------------------- frame */

  private applyCamera(delta: number): void {
    const rate = 3.2;
    this.pose.yaw = damp(this.pose.yaw, this.goal.yaw, rate, delta);
    this.pose.pitch = damp(this.pose.pitch, this.goal.pitch, rate, delta);
    this.pose.distance = damp(this.pose.distance, this.goal.distance, rate, delta);
    this.pose.target.x = damp(this.pose.target.x, this.goal.target.x, rate, delta);
    this.pose.target.y = damp(this.pose.target.y, this.goal.target.y, rate, delta);
    this.pose.target.z = damp(this.pose.target.z, this.goal.target.z, rate, delta);
    const { x, y } = this.idle;
    // Very wide screens have room to spare at the sides, so move in a little.
    const distance = this.pose.distance * (this.camera.aspect > 1.8 ? THREE.MathUtils.lerp(1, 0.82, Math.min(1, (this.camera.aspect - 1.8) / 0.8)) : 1);
    const yaw = this.pose.yaw + x;
    const pitch = this.pose.pitch + y;
    this.camera.position.set(
      this.pose.target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      this.pose.target.y + Math.sin(pitch) * distance,
      this.pose.target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    this.camera.lookAt(this.pose.target);
    if (this.debugPose) {
      this.camera.position.copy(this.debugPose.position);
      this.camera.lookAt(this.debugPose.target);
    }
    this.applyViewShift(delta);
  }

  /** With a detail panel open on a wide screen, slide the scene left so the building stays in view. */
  private applyViewShift(delta: number): void {
    const wide = this.camera.aspect > 1.15;
    this.shift = damp(this.shift, this.selected && wide ? 1 : 0, 4, delta);
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    if (this.shift < 0.002) {
      this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(width, height, width * 0.15 * this.shift, 0, width, height);
  }

  private updateHover(): void {
    if (this.dragging) return;
    const next = this.selected ?? this.pick();
    if (next === this.hovered) {
      if (next) this.events.onHover(next.id, this.project(next));
      return;
    }
    this.hovered = next;
    this.renderer.domElement.style.cursor = next && !this.selected ? 'pointer' : 'grab';
    this.events.onHover(next ? next.id : null, next ? this.project(next) : null);
  }

  private project(building: Building): { x: number; y: number } {
    const anchor = building.group.localToWorld(building.labelAnchor.clone());
    anchor.project(this.camera);
    const canvas = this.renderer.domElement;
    return { x: ((anchor.x + 1) / 2) * canvas.clientWidth, y: ((1 - anchor.y) / 2) * canvas.clientHeight };
  }

  private adaptQuality(delta: number): void {
    if (delta > 0.034) this.slowFrames += 1;
    else this.slowFrames = Math.max(0, this.slowFrames - 0.2);
    if (this.slowFrames > 50 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
      this.slowFrames = 0;
      this.resize();
    } else if (this.slowFrames > 110 && this.bloom?.enabled) {
      this.bloom.enabled = false;
      this.slowFrames = 0;
    }
  }

  /* --------------------------------------------------------- post-processing */

  /** Picks the richest pipeline this GPU can run. ?safe=1 forces the plain renderer. */
  private chooseMode(): 'high' | 'low' | 'basic' {
    if (new URLSearchParams(window.location.search).has('safe')) return 'basic';
    const extensions = this.renderer.extensions;
    const floatTargets = extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float');
    return this.renderer.capabilities.isWebGL2 && floatTargets ? 'high' : 'low';
  }

  private buildComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.mode === 'basic') return;
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const target = this.mode === 'low'
      ? new THREE.WebGLRenderTarget(width * this.safePixelRatio(width, height), height * this.safePixelRatio(width, height), { type: THREE.UnsignedByteType })
      : undefined;
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.mode === 'low' ? 0.3 : 0.34, 0.55, this.mode === 'low' ? 0.88 : 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(this.safePixelRatio(width, height));
    composer.setSize(width, height);
    this.composer = composer;
    this.bloom = bloom;
  }

  private renderFrame(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.blackChecks < 12 && this.frameCount % 10 === 5) this.checkForBlackFrame();
    this.frameCount += 1;
  }

  private frameCount = 0;

  /**
   * Some browsers (strict privacy settings, odd drivers) accept the pipeline but present a black
   * frame. The sky is never pure black, so if every sampled pixel is zero, step down a mode.
   */
  private checkForBlackFrame(): void {
    this.blackChecks += 1;
    const gl = this.renderer.getContext();
    const pixel = new Uint8Array(4);
    let seen = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.3], [0.5, 0.8], [0.3, 0.6]] as const) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * fx), Math.floor(gl.drawingBufferHeight * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      seen += (pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0);
    }
    if (seen > 0) {
      this.blackChecks = 12;
      return;
    }
    if (this.mode === 'high') this.mode = 'low';
    else if (this.mode === 'low') this.mode = 'basic';
    else {
      this.blackChecks = 12;
      this.events.onBlocked();
      return;
    }
    this.blackChecks = 0;
    this.buildComposer();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.stop();
    this.events.onFail();
  };


  private readonly tick = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);
    if (document.visibilityState !== 'visible') return;
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const time = this.timer.getElapsed();
    this.world.update(this.reducedMotion ? 0 : time, delta);
    const idleFor = performance.now() - this.lastInteraction;
    if (!this.reducedMotion && !this.selected && !this.dragging) {
      const sway = Math.min(1, Math.max(0, (idleFor - 2500) / 3000));
      this.idle.x = damp(this.idle.x, Math.sin(time * 0.11) * 0.2 * sway, 1.2, delta);
      this.idle.y = damp(this.idle.y, Math.sin(time * 0.083) * 0.035 * sway, 1.2, delta);
    } else {
      this.idle.x = damp(this.idle.x, 0, 3, delta);
      this.idle.y = damp(this.idle.y, 0, 3, delta);
    }
    this.applyCamera(delta);
    this.updateHover();
    this.world.buildings.forEach((building) => {
      const boost = building === this.hovered ? 1 : 0;
      building.glowMaterials.forEach((material) => {
        const base = (material.userData.base as number | undefined) ?? material.emissiveIntensity;
        material.userData.base = base;
        material.userData.hover = damp((material.userData.hover as number | undefined) ?? 0, boost, 10, delta);
        material.emissiveIntensity = base * (1 + (material.userData.hover as number) * 0.9);
      });
    });
    this.adaptQuality(delta);
    this.renderFrame();
  };
}
