import { describe, expect, it } from 'vitest';
import { countdownCaption, garlandBulbs } from '../countdown-captions';

describe('countdownCaption', () => {
  it('has a line for every day count', () => {
    for (const days of [0, 1, 2, 5, 10, 20, 30, 45, 400]) expect(countdownCaption(days).length).toBeGreaterThan(10);
  });
  it('treats negative or fractional days as whole days', () => {
    expect(countdownCaption(-3)).toBe(countdownCaption(0));
    expect(countdownCaption(1.9)).toBe(countdownCaption(1));
  });
});

describe('garlandBulbs', () => {
  it('lights one bulb per day left, plus tonight', () => {
    expect(garlandBulbs(10)).toEqual({ total: 54, lit: 11 });
  });
  it('keeps one bulb lit on the last day', () => {
    expect(garlandBulbs(0).lit).toBe(1);
  });
  it('never has more lit bulbs than total, even before November', () => {
    expect(garlandBulbs(80)).toEqual({ total: 54, lit: 54 });
    expect(garlandBulbs(365)).toEqual({ total: 54, lit: 54 });
  });
});
