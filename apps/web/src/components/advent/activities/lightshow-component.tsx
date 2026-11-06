"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator } from '@santa-tracker/localization';
import { audioPreferencesFrom, createAudioController } from '@santa-tracker/activity-sdk/audio';
import { loadLightshow, saveLightshow, type LightshowComposition } from '@/lib/lightshow';
import { LightshowControls } from './lightshow-controls';
import { LightshowStage } from './lightshow-stage';

const defaults: LightshowComposition = { scene: 'tree', palette: 'warm', pattern: 'twinkle', speed: 3, brightness: 78 };
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
      context.resume().catch(() => undefined);
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
  const toggleFullscreen = () => {
    const action = fullscreen ? exitFullscreen() : enterFullscreen();
    action.catch(() => setFullscreen(false));
  };

  return (
    <section className="space-y-5" aria-labelledby="lightshow-title">
      <h2 id="lightshow-title" className="text-2xl font-bold">{translator.t('advent.activity.lightshow.title')}</h2>
      <p>{translator.t('advent.activity.lightshow.intro')}</p>
      <LightshowStage composition={composition} tick={tick} reducedMotion={reducedMotion} fullscreen={fullscreen} stageRef={stageRef} translator={translator} onFullscreenToggle={toggleFullscreen} />
      {!fullscreen ? <LightshowControls composition={composition} sound={sound} translator={translator} onUpdate={update} onSoundChange={setSound} onPreset={applyPreset} /> : null}
      {!fullscreen ? <p className="text-sm text-slate-600" aria-live="polite">{reducedMotion ? translator.t('advent.activity.lightshow.reducedMotion') : translator.t(storageAvailable ? 'advent.activity.lightshow.saved' : 'advent.activity.lightshow.saveUnavailable')}</p> : null}
    </section>
  );
}

