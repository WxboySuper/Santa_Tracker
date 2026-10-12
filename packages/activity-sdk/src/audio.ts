export type AudioPreferences = { enabled: boolean; muted: boolean; volume: number; reducedSensory: boolean };
export type AudioPlayer = { play: (id: string, volume: number) => void };
function clampVolume(volume: number): number { return Math.max(0, Math.min(1, volume)); }
function canPlay(preferences: AudioPreferences, volume: number): boolean {
  return preferences.enabled && !preferences.muted && !preferences.reducedSensory && volume > 0;
}
export function createAudioController(preferences: AudioPreferences, player: AudioPlayer) {
  return {
    play(id: string): boolean {
      const volume = clampVolume(preferences.volume);
      if (!canPlay(preferences, volume)) return false;
      player.play(id, volume);
      return true;
    },
  };
}
export function audioPreferencesFrom(options: Partial<AudioPreferences> = {}): AudioPreferences { return { enabled: options.enabled ?? false, muted: options.muted ?? false, volume: options.volume ?? 1, reducedSensory: options.reducedSensory ?? false }; }
