"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, type MessageKey } from '@santa-tracker/localization';
import { audioPreferencesFrom, createAudioController } from '@santa-tracker/activity-sdk/audio';
import { lightColor, lightIntensity, loadLightshow, saveLightshow, type LightshowComposition, type LightshowPalette, type LightshowPattern } from '@/lib/lightshow';

const defaults: LightshowComposition = { scene: 'tree', palette: 'warm', pattern: 'twinkle', speed: 3, brightness: 78 };
const presets: Record<string, LightshowComposition> = {
  fireplace: { ...defaults, palette: 'warm', pattern: 'fade', speed: 2, brightness: 72 },
  snow: { ...defaults, palette: 'ice', pattern: 'wave', speed: 2, brightness: 68 },
  midnight: { ...defaults, palette: 'redGold', pattern: 'chase', speed: 3, brightness: 84 },
};

export function LightshowActivity({ config, locale }: { config: { scene: 'tree' | 'house' }; locale: string }) {
  const translator = createTranslator({ locale });
  const [composition, setComposition] = useState<LightshowComposition>(() => ({ ...defaults, scene: config.scene }));
  const [tick, setTick] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const stored = loadLightshow();
    if (stored) setComposition(stored);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), reducedMotion ? 2000 : Math.max(300, 1200 - composition.speed * 160));
    return () => window.clearInterval(timer);
  }, [composition.speed, reducedMotion]);

  const playChime = useCallback(() => {
    if (!sound || reducedMotion || !['twinkle', 'chase'].includes(composition.pattern)) return;
    const preferences = audioPreferencesFrom({ enabled: sound, reducedSensory: reducedMotion, volume: 0.12 });
    const controller = createAudioController(preferences, { play: () => {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = contextRef.current ?? new AudioContextConstructor();
      contextRef.current = context;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660 + (tick % 5) * 55;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.5);
    } });
    controller.play('lightshow-chime');
  }, [composition.pattern, reducedMotion, sound, tick]);

  useEffect(() => {
    if (tick > 0 && tick % 12 === 0) playChime();
  }, [playChime, tick]);

  useEffect(() => {
    setStorageAvailable(saveLightshow(composition));
  }, [composition]);

  const update = (patch: Partial<LightshowComposition>) => setComposition((current) => ({ ...current, ...patch }));
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await stageRef.current?.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement) || Boolean(stageRef.current));
    } catch { setFullscreen(false); }
  };
  const exitFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* Keep the scene usable if fullscreen is unavailable. */ }
    setFullscreen(false);
  };
  const applyPreset = (preset: LightshowComposition) => setComposition({ ...preset, scene: composition.scene });
  const colors = Array.from({ length: 26 }, (_, index) => lightColor(composition.palette, index));

  return (
    <section className="space-y-5" aria-labelledby="lightshow-title">
      <h2 id="lightshow-title" className="text-2xl font-bold">{translator.t('advent.activity.lightshow.title')}</h2>
      <p>{translator.t('advent.activity.lightshow.intro')}</p>
      <div ref={stageRef} className={`relative overflow-hidden rounded-2xl bg-slate-950 ${fullscreen ? 'flex min-h-screen items-center justify-center' : ''}`}>
        <svg className={`block w-full ${fullscreen ? 'max-h-screen max-w-4xl' : ''}`} viewBox="0 0 760 420" role="img" aria-label={translator.t(composition.scene === 'tree' ? 'advent.activity.lightshow.treeScene' : 'advent.activity.lightshow.houseScene')}>
          <defs><linearGradient id="night" x2="0" y2="1"><stop stopColor="#101b35"/><stop offset="1" stopColor="#090e1b"/></linearGradient><radialGradient id="glow"><stop stopColor="#fbdca1" stopOpacity=".2"/><stop offset="1" stopColor="#fbdca1" stopOpacity="0"/></radialGradient></defs>
          <rect width="760" height="420" fill="url(#night)"/><circle cx="390" cy="190" r="220" fill="url(#glow)"/><path d="M0 365 Q190 330 390 370 T760 350 V420 H0Z" fill="#162b2b"/>
          {composition.scene === 'tree' ? <g><path d="M380 58 242 230h82l-112 113h336L436 230h82Z" fill="#17483c"/><path d="M380 328v54" stroke="#6b4931" strokeWidth="24"/><path d="M278 231 Q380 284 482 231 M246 298 Q380 355 514 298 M309 165 Q380 205 451 165" fill="none" stroke="#c0a36f" strokeWidth="3" opacity=".72"/></g> : <g><path d="M218 201 380 78l162 123v172H218Z" fill="#293748"/><path d="M190 207 380 62l190 145" fill="none" stroke="#b9c5d3" strokeWidth="11"/><rect x="352" y="282" width="57" height="91" rx="2" fill="#533a2e"/><path d="M255 232h64v57h-64zm186 0h64v57h-64z" fill="#e8bd77"/><path d="M287 232v57m-32-28h64m218-29v57m-32-28h64" stroke="#293748" strokeWidth="5"/></g>}
          {Array.from({ length: 26 }, (_, index) => {
            const x = composition.scene === 'tree' ? 278 + (index % 6) * 39 + (Math.floor(index / 6) % 2) * 10 : 239 + (index % 9) * 34;
            const y = composition.scene === 'tree' ? 150 + Math.floor(index / 6) * 47 : 205 + Math.floor(index / 9) * 52;
            const intensity = lightIntensity(composition.pattern, index, tick, reducedMotion) * composition.brightness / 100;
            return <circle key={index} cx={x} cy={y} r={composition.pattern === 'steady' ? 7 : 8} fill={colors[index]} opacity={intensity} style={{ transition: `opacity ${reducedMotion ? 1800 : 450}ms ease-in-out`, filter: `drop-shadow(0 0 ${6 + intensity * 8}px ${colors[index]})` }} />;
          })}
        </svg>
        <button type="button" onClick={() => { void (fullscreen ? exitFullscreen() : enterFullscreen()); }} className="absolute right-3 top-3 rounded-lg bg-slate-900/80 px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{translator.t(fullscreen ? 'advent.activity.lightshow.exitFullscreen' : 'advent.activity.lightshow.fullscreen')}</button>
      </div>
      {!fullscreen ? <div className="grid gap-5 md:grid-cols-2">
        <fieldset className="space-y-2"><legend className="font-semibold">{translator.t('advent.activity.lightshow.presets')}</legend><div className="flex flex-wrap gap-2">{Object.entries(presets).map(([key, preset]) => <button key={key} type="button" onClick={() => applyPreset(preset)} className="rounded-lg border border-slate-400 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{translator.t(`advent.activity.lightshow.preset.${key}` as MessageKey)}</button>)}</div></fieldset>
        <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.scene')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.scene} onChange={(event) => update({ scene: event.currentTarget.value as LightshowComposition['scene'] })}><option value="tree">{translator.t('advent.activity.lightshow.tree')}</option><option value="house">{translator.t('advent.activity.lightshow.house')}</option></select></label>
        <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.palette')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.palette} onChange={(event) => update({ palette: event.currentTarget.value as LightshowPalette })}>{(['warm', 'classic', 'ice', 'redGold'] as const).map((palette) => <option key={palette} value={palette}>{translator.t(`advent.activity.lightshow.palette.${palette}` as MessageKey)}</option>)}</select></label>
        <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.pattern')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.pattern} onChange={(event) => update({ pattern: event.currentTarget.value as LightshowPattern })}>{(['steady', 'twinkle', 'chase', 'fade', 'wave'] as const).map((pattern) => <option key={pattern} value={pattern}>{translator.t(`advent.activity.lightshow.pattern.${pattern}` as MessageKey)}</option>)}</select></label>
        <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.speed')}</span><input className="w-full accent-blue-800" type="range" min="1" max="5" value={composition.speed} onChange={(event) => update({ speed: Number(event.currentTarget.value) })} /><span className="sr-only">{composition.speed}</span></label>
        <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.brightness')}</span><input className="w-full accent-blue-800" type="range" min="20" max="100" value={composition.brightness} onChange={(event) => update({ brightness: Number(event.currentTarget.value) })} /></label>
        <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5 accent-blue-800" type="checkbox" checked={sound} onChange={(event) => setSound(event.currentTarget.checked)} /><span>{translator.t('advent.activity.lightshow.sound')}</span></label>
      </div> : null}
      {!fullscreen ? <p className="text-sm text-slate-600" aria-live="polite">{reducedMotion ? translator.t('advent.activity.lightshow.reducedMotion') : translator.t(storageAvailable ? 'advent.activity.lightshow.saved' : 'advent.activity.lightshow.saveUnavailable')}</p> : null}
    </section>
  );
}
