export type AudioPreferences = { enabled: boolean; muted: boolean; volume: number; reducedSensory: boolean };
export type AudioPlayer = { play: (id: string, volume: number) => void };

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

function canPlay(preferences: AudioPreferences, volume: number): boolean {
  return preferences.enabled && !preferences.muted && !preferences.reducedSensory && volume > 0;
}

function isValidPreferences(value: unknown): value is AudioPreferences {
  return typeof value === 'object' && value !== null;
}

export function createAudioController(preferences: AudioPreferences, player: AudioPlayer) {
  return {
    play(id: string): boolean {
      if (!isValidPreferences(preferences) || typeof player?.play !== 'function') return false;
      if (typeof id !== 'string' || id.trim().length === 0) return false;
      const volume = clampVolume(preferences.volume);
      if (!canPlay(preferences, volume)) return false;
      player.play(id, volume);
      return true;
    },
  };
}

export function audioPreferencesFrom(options: Partial<AudioPreferences> | null | undefined = {}): AudioPreferences {
  const source: Partial<AudioPreferences> = options ?? {};
  const candidate = source.volume ?? 1;
  return {
    enabled: source.enabled ?? false,
    muted: source.muted ?? false,
    volume: Number.isFinite(candidate) ? Math.max(0, Math.min(1, candidate)) : 1,
    reducedSensory: source.reducedSensory ?? false,
  };
}
