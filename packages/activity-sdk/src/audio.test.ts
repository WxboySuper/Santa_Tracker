import { describe, expect, it, vi } from 'vitest';
import { audioPreferencesFrom, createAudioController } from './audio';

describe('audio preferences', () => {
  it.each([
    [{ enabled: false }, false],
    [{ enabled: true, muted: true }, false],
    [{ enabled: true, volume: 0 }, false],
    [{ enabled: true, reducedSensory: true }, false],
  ])('blocks audio when preferences require it', (options, expected) => {
    const play = vi.fn();
    expect(createAudioController(audioPreferencesFrom(options), { play }).play('chime')).toBe(expected);
    expect(play).not.toHaveBeenCalled();
  });

  it('passes volume to the injected player', () => {
    const play = vi.fn();
    expect(createAudioController(audioPreferencesFrom({ enabled: true, volume: 0.4 }), { play }).play('chime')).toBe(true);
    expect(play).toHaveBeenCalledWith('chime', 0.4);
  });

  it('clamps stored volume and falls back for non-finite input', () => {
    expect(audioPreferencesFrom({ volume: 2 }).volume).toBe(1);
    expect(audioPreferencesFrom({ volume: -1 }).volume).toBe(0);
    expect(audioPreferencesFrom({ volume: Number.NaN }).volume).toBe(1);
    expect(audioPreferencesFrom({ volume: Number.POSITIVE_INFINITY }).volume).toBe(1);
    expect(audioPreferencesFrom(null).volume).toBe(1);
  });

  it('blocks blank sound ids and malformed controller inputs', () => {
    const play = vi.fn();
    const controller = createAudioController(audioPreferencesFrom({ enabled: true }), { play });
    expect(controller.play('')).toBe(false);
    expect(controller.play('   ')).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(createAudioController(null as never, { play }).play('chime')).toBe(false);
    expect(createAudioController(audioPreferencesFrom({ enabled: true }), null as never).play('chime')).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('treats a poisoned non-finite stored volume as silent', () => {
    const play = vi.fn();
    const controller = createAudioController(
      { enabled: true, muted: false, volume: Number.NaN, reducedSensory: false },
      { play },
    );
    expect(controller.play('chime')).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});
