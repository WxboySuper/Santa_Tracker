export type AudioPreferences = { enabled: boolean; muted: boolean; volume: number; reducedSensory: boolean };
export type AudioPlayer = { play: (id: string, volume: number) => void };
export function createAudioController(preferences: AudioPreferences, player: AudioPlayer) {
  return { play(id: string): boolean { const volume = Math.max(0, Math.min(1, preferences.volume)); if (!preferences.enabled || preferences.muted || preferences.reducedSensory || volume === 0) return false; player.play(id, volume); return true; } };
}
export function audioPreferencesFrom(options: Partial<AudioPreferences> = {}): AudioPreferences { return { enabled: options.enabled ?? false, muted: options.muted ?? false, volume: options.volume ?? 1, reducedSensory: options.reducedSensory ?? false }; }
