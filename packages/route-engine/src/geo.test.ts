import { describe, expect, it } from 'vitest';
import { haversineKm, interpolateGreatCircle, legSpeedKmh, normalizeLng } from './geo';

describe('normalizeLng', () => {
  it('wraps out-of-range longitudes and keeps +/-180', () => {
    expect(normalizeLng(190)).toBeCloseTo(-170);
    expect(normalizeLng(-190)).toBeCloseTo(170);
    expect(normalizeLng(180)).toBe(180);
    expect(normalizeLng(-180)).toBe(-180);
    expect(normalizeLng(540)).toBeCloseTo(-180);
  });
});

describe('haversineKm', () => {
  it('matches known distances', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    expect(haversineKm(london, paris)).toBeGreaterThan(340);
    expect(haversineKm(london, paris)).toBeLessThan(348);
    expect(haversineKm(london, london)).toBe(0);
  });

  it('measures across the antimeridian the short way', () => {
    // 2 degrees of longitude at the equator straddling 180: about 222 km, not ~40,000.
    const d = haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(225);
  });
});

describe('legSpeedKmh', () => {
  it('returns km/h, or null for non-positive durations', () => {
    expect(legSpeedKmh({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 3600)).toBeCloseTo(111.2, 0);
    expect(legSpeedKmh({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 0)).toBeNull();
  });
});

describe('interpolateGreatCircle', () => {
  const a = { lat: 10, lng: 20 };
  const b = { lat: -30, lng: 140 };

  it('returns the endpoints at t=0 and t=1', () => {
    const start = interpolateGreatCircle(a, b, 0);
    const end = interpolateGreatCircle(a, b, 1);
    expect(start.lat).toBeCloseTo(a.lat, 6);
    expect(start.lng).toBeCloseTo(a.lng, 6);
    expect(end.lat).toBeCloseTo(b.lat, 6);
    expect(end.lng).toBeCloseTo(b.lng, 6);
  });

  it('clamps t outside 0..1 and tolerates NaN', () => {
    expect(interpolateGreatCircle(a, b, -5).lat).toBeCloseTo(a.lat, 6);
    expect(interpolateGreatCircle(a, b, 7).lat).toBeCloseTo(b.lat, 6);
    expect(interpolateGreatCircle(a, b, Number.NaN).lat).toBeCloseTo(a.lat, 6);
  });

  it('crosses the antimeridian the short way (never visits lng 0)', () => {
    const from = { lat: 0, lng: 179 };
    const to = { lat: 0, lng: -179 };
    for (let i = 0; i <= 10; i++) {
      const p = interpolateGreatCircle(from, to, i / 10);
      expect(Math.abs(p.lng)).toBeGreaterThan(178);
      expect(p.lng).toBeGreaterThanOrEqual(-180);
      expect(p.lng).toBeLessThanOrEqual(180);
    }
    const mid = interpolateGreatCircle(from, to, 0.5);
    expect(Math.abs(Math.abs(mid.lng) - 180)).toBeLessThan(1e-6);
  });

  it('stays on the leg: the two halves add up to the leg length', () => {
    const total = haversineKm(a, b);
    const mid = interpolateGreatCircle(a, b, 0.5);
    expect(haversineKm(a, mid)).toBeCloseTo(total / 2, 3);
    expect(haversineKm(mid, b)).toBeCloseTo(total / 2, 3);
  });

  it('handles the pole anchor and coincident points without NaN', () => {
    const pole = { lat: 80, lng: 180 };
    const p = interpolateGreatCircle(pole, { lat: 60, lng: -170 }, 0.3);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lng)).toBe(true);
    expect(interpolateGreatCircle(pole, pole, 0.5)).toEqual({ lat: 80, lng: 180 });
  });

  it('falls back to a finite lerp for near-antipodal legs', () => {
    const p = interpolateGreatCircle({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 0.5);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lng)).toBe(true);
  });
});
