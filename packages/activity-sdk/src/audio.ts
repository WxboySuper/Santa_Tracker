/** Playback settings that gate activity sound effects. */
export type AudioPreferences = { enabled: boolean; muted: boolean; volume: number; reducedSensory: boolean };
/** Minimal sound-player interface injected into the audio controller. */
export type AudioPlayer = { play: (id: string, volume: number) => void };

function clampVolume(volume: number, fallback: number): number {
  if (!Number.isFinite(volume)) return fallback;
  return Math.max(0, Math.min(1, volume));
}

function canPlay(preferences: AudioPreferences, volume: number): boolean {
  return preferences.enabled && !preferences.muted && !preferences.reducedSensory && volume > 0;
}

function isValidPreferences(value: unknown): value is AudioPreferences {
  if (typeof value !== 'object' || value === null) return false;
  const preferences = value as Record<string, unknown>;
  return typeof preferences.enabled === 'boolean'
    && typeof preferences.muted === 'boolean'
    && typeof preferences.volume === 'number'
    && typeof preferences.reducedSensory === 'boolean';
}

/** Creates a player wrapper that applies preference, volume, and sound-id guards. */
export function createAudioController(preferences: AudioPreferences, player: AudioPlayer) {
  return {
    play(id: string): boolean {
      if (!isValidPreferences(preferences) || typeof player?.play !== 'function') return false;
      if (typeof id !== 'string' || id.trim().length === 0) return false;
      const volume = clampVolume(preferences.volume, 0);
      if (!canPlay(preferences, volume)) return false;
      player.play(id.trim(), volume);
      return true;
    },
  };
}

/** Normalizes optional or untrusted preference values into safe playback settings. */
export function audioPreferencesFrom(options: Partial<AudioPreferences> | null | undefined = {}): AudioPreferences {
  const source: Partial<AudioPreferences> = options ?? {};
  return {
    enabled: source.enabled === true,
    muted: source.muted === true,
    volume: source.volume === undefined ? 1 : clampVolume(source.volume, 0),
    reducedSensory: source.reducedSensory === true,
  };
}
