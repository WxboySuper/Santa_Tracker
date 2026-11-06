import type { createTranslator, MessageKey } from '@santa-tracker/localization';
import type { LightshowComposition, LightshowPalette, LightshowPattern } from '@/lib/lightshow';

const presets: Record<string, LightshowComposition> = {
  fireplace: { scene: 'tree', palette: 'warm', pattern: 'fade', speed: 2, brightness: 72 },
  snow: { scene: 'tree', palette: 'ice', pattern: 'wave', speed: 2, brightness: 68 },
  midnight: { scene: 'tree', palette: 'redGold', pattern: 'chase', speed: 3, brightness: 84 },
};

type LightshowControlsProps = {
  composition: LightshowComposition;
  sound: boolean;
  translator: ReturnType<typeof createTranslator>;
  onUpdate: (patch: Partial<LightshowComposition>) => void;
  onSoundChange: (enabled: boolean) => void;
  onPreset: (preset: LightshowComposition) => void;
};

export function LightshowControls({ composition, sound, translator, onUpdate, onSoundChange, onPreset }: LightshowControlsProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <fieldset className="space-y-2"><legend className="font-semibold">{translator.t('advent.activity.lightshow.presets')}</legend><div className="flex flex-wrap gap-2">{Object.entries(presets).map(([key, preset]) => <button key={key} type="button" onClick={() => onPreset({ ...preset, scene: composition.scene })} className="rounded-lg border border-slate-400 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{translator.t(`advent.activity.lightshow.preset.${key}` as MessageKey)}</button>)}</div></fieldset>
      <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.scene')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.scene} onChange={(event) => onUpdate({ scene: event.currentTarget.value as LightshowComposition['scene'] })}><option value="tree">{translator.t('advent.activity.lightshow.tree')}</option><option value="house">{translator.t('advent.activity.lightshow.house')}</option></select></label>
      <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.palette')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.palette} onChange={(event) => onUpdate({ palette: event.currentTarget.value as LightshowPalette })}>{(['warm', 'classic', 'ice', 'redGold'] as const).map((palette) => <option key={palette} value={palette}>{translator.t(`advent.activity.lightshow.palette.${palette}` as MessageKey)}</option>)}</select></label>
      <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.pattern')}</span><select className="w-full rounded-lg border border-slate-400 px-3 py-2" value={composition.pattern} onChange={(event) => onUpdate({ pattern: event.currentTarget.value as LightshowPattern })}>{(['steady', 'twinkle', 'chase', 'fade', 'wave'] as const).map((pattern) => <option key={pattern} value={pattern}>{translator.t(`advent.activity.lightshow.pattern.${pattern}` as MessageKey)}</option>)}</select></label>
      <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.speed')}</span><input className="w-full accent-blue-800" type="range" min="1" max="5" value={composition.speed} onChange={(event) => onUpdate({ speed: Number(event.currentTarget.value) })} /><span className="sr-only">{composition.speed}</span></label>
      <label className="space-y-2"><span className="block font-semibold">{translator.t('advent.activity.lightshow.brightness')}</span><input className="w-full accent-blue-800" type="range" min="20" max="100" value={composition.brightness} onChange={(event) => onUpdate({ brightness: Number(event.currentTarget.value) })} /></label>
      <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5 accent-blue-800" type="checkbox" checked={sound} onChange={(event) => onSoundChange(event.currentTarget.checked)} /><span>{translator.t('advent.activity.lightshow.sound')}</span></label>
    </div>
  );
}
