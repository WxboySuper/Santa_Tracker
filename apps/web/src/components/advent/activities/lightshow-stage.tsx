import type { createTranslator } from '@santa-tracker/localization';
import { lightColor, lightIntensity, type LightshowComposition } from '@/lib/lightshow';

type LightshowStageProps = {
  composition: LightshowComposition;
  tick: number;
  reducedMotion: boolean;
  fullscreen: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  translator: ReturnType<typeof createTranslator>;
  onFullscreenToggle: () => void;
};

export function LightshowStage({ composition, tick, reducedMotion, fullscreen, stageRef, translator, onFullscreenToggle }: LightshowStageProps) {
  const sceneLabel = composition.scene === 'tree' ? 'advent.activity.lightshow.treeScene' : 'advent.activity.lightshow.houseScene';
  return (
    <div ref={stageRef} className={`relative overflow-hidden rounded-2xl bg-slate-950 ${fullscreen ? 'flex min-h-screen items-center justify-center' : ''}`}>
      <svg className={`block w-full ${fullscreen ? 'max-h-screen max-w-4xl' : ''}`} viewBox="0 0 760 420" role="img" aria-label={translator.t(sceneLabel)}>
        <defs><linearGradient id="night" x2="0" y2="1"><stop stopColor="#101b35"/><stop offset="1" stopColor="#090e1b"/></linearGradient><radialGradient id="glow"><stop stopColor="#fbdca1" stopOpacity=".2"/><stop offset="1" stopColor="#fbdca1" stopOpacity="0"/></radialGradient></defs>
        <rect width="760" height="420" fill="url(#night)"/><circle cx="390" cy="190" r="220" fill="url(#glow)"/><path d="M0 365 Q190 330 390 370 T760 350 V420 H0Z" fill="#162b2b"/>
        <SceneArtwork scene={composition.scene} />
        <LightBulbs composition={composition} tick={tick} reducedMotion={reducedMotion} />
      </svg>
      <button type="button" onClick={onFullscreenToggle} className="absolute right-3 top-3 rounded-lg bg-slate-900/80 px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{translator.t(fullscreen ? 'advent.activity.lightshow.exitFullscreen' : 'advent.activity.lightshow.fullscreen')}</button>
    </div>
  );
}

function SceneArtwork({ scene }: { scene: LightshowComposition['scene'] }) {
  if (scene === 'tree') return <g><path d="M380 58 242 230h82l-112 113h336L436 230h82Z" fill="#17483c"/><path d="M380 328v54" stroke="#6b4931" strokeWidth="24"/><path d="M278 231 Q380 284 482 231 M246 298 Q380 355 514 298 M309 165 Q380 205 451 165" fill="none" stroke="#c0a36f" strokeWidth="3" opacity=".72"/></g>;
  return <g><path d="M218 201 380 78l162 123v172H218Z" fill="#293748"/><path d="M190 207 380 62l190 145" fill="none" stroke="#b9c5d3" strokeWidth="11"/><rect x="352" y="282" width="57" height="91" rx="2" fill="#533a2e"/><path d="M255 232h64v57h-64zm186 0h64v57h-64z" fill="#e8bd77"/><path d="M287 232v57m-32-28h64m218-29v57m-32-28h64" stroke="#293748" strokeWidth="5"/></g>;
}

function LightBulbs({ composition, tick, reducedMotion }: { composition: LightshowComposition; tick: number; reducedMotion: boolean }) {
  return <>{Array.from({ length: 26 }, (_, index) => <LightBulb key={index} composition={composition} index={index} tick={tick} reducedMotion={reducedMotion} />)}</>;
}

function LightBulb({ composition, index, tick, reducedMotion }: { composition: LightshowComposition; index: number; tick: number; reducedMotion: boolean }) {
  const x = composition.scene === 'tree' ? 278 + (index % 6) * 39 + (Math.floor(index / 6) % 2) * 10 : 239 + (index % 9) * 34;
  const y = composition.scene === 'tree' ? 150 + Math.floor(index / 6) * 47 : 205 + Math.floor(index / 9) * 52;
  const color = lightColor(composition.palette, index);
  const intensity = lightIntensity(composition.pattern, index, tick, reducedMotion) * composition.brightness / 100;
  return <circle cx={x} cy={y} r={composition.pattern === 'steady' ? 7 : 8} fill={color} opacity={intensity} style={{ transition: `opacity ${reducedMotion ? 1800 : 450}ms ease-in-out`, filter: `drop-shadow(0 0 ${6 + intensity * 8}px ${color})` }} />;
}
