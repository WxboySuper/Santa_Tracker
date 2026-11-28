import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { christmasUtcOffset, withinCountryBounds } from './refresh-validation.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const places = readJson('./data/places.json');
const curated = readJson('./data/curated.json');
const aliases = readJson('./data/country-codes.json').aliases;
const excluded = new Set(['AQ', 'BV', 'HM', 'IO', 'TF', 'UM']);
const all = [...places, ...curated];

function normalizedName(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function assertNoNearbyDuplicateNames(group) {
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      expect(distanceKm(group[i], group[j]), `${group[i].name} appears twice within 100 km`).toBeGreaterThanOrEqual(100);
    }
  }
}

function assertUniqueNearbyNames(places) {
  const groups = new Map();
  for (const place of places) {
    const key = `${place.country}:${normalizedName(place.name)}`;
    const group = groups.get(key) ?? [];
    group.push(place);
    groups.set(key, group);
  }
  for (const group of groups.values()) assertNoNearbyDuplicateNames(group);
}

describe('route candidate data', () => {
  it('covers every permanently inhabited ISO 3166-1 country and territory', () => {
    const covered = new Set(all.map((place) => place.country));
    for (const code of new Set(Object.values(aliases))) {
      if (!excluded.has(code)) expect(covered.has(code), `${code} has no candidate`).toBe(true);
    }
  });

  it('keeps every candidate inside its committed country bounds with a correct Christmas 2026 offset', () => {
    for (const place of all) {
      expect(withinCountryBounds(place.country, place.lat, place.lng), `${place.id} outside ${place.country}`).toBe(true);
      expect(place.utcOffsetMinutes, `${place.id} offset for ${place.timezone}`).toBe(christmasUtcOffset(place.timezone));
      expect(place.name.includes('\uFFFD'), `${place.id} contains a replacement character`).toBe(false);
    }
  });

  it('keeps Tromsø spelled correctly and removes duplicate nearby names', () => {
    expect(curated.find((place) => place.id === 'Q26087')?.name).toMatch(/^Tromsø(?: Municipality)?$/);
    assertUniqueNearbyNames(all);
  });
});
