import { describe, expect, it } from 'vitest';
import { TUNES } from '@/components/village/music-box';

const NOTE = /^[A-G](#|b)?\d$/;

describe('music box tunes', () => {
  it('has at least three tunes, each with a title and credit', () => {
    expect(TUNES.length).toBeGreaterThanOrEqual(3);
    for (const tune of TUNES) {
      expect(tune.title.length).toBeGreaterThan(0);
      expect(tune.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('writes every note as a valid name with a positive duration', () => {
    for (const tune of TUNES) {
      expect(tune.tempo).toBeGreaterThan(60);
      expect(tune.tempo).toBeLessThan(220);
      for (const [note, beats] of tune.steps) {
        if (note !== null) expect(note, `${tune.title}: ${note}`).toMatch(NOTE);
        expect(beats).toBeGreaterThan(0);
      }
    }
  });

  it('ends each tune with a rest so the next one never starts on a held note', () => {
    for (const tune of TUNES) {
      expect(tune.steps.at(-1)?.[0]).toBeNull();
    }
  });
});
