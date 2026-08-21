import { SCHEMA_VERSION, type Route } from '@santa-tracker/contracts';

export function createDeterministicRoute(): Route {
  const base = Date.parse('2026-12-24T00:00:00.000Z');
  return {
    schemaVersion: SCHEMA_VERSION,
    season: 2026,
    stops: [
      {
        locationId: 'north-pole',
        arrivalIso: new Date(base).toISOString(),
        departureIso: new Date(base + 60_000).toISOString(),
        durationSeconds: 60,
      },
      {
        locationId: 'auckland-nz',
        arrivalIso: new Date(base + 120_000).toISOString(),
        departureIso: new Date(base + 180_000).toISOString(),
        durationSeconds: 60,
      },
      {
        locationId: 'tokyo-jp',
        arrivalIso: new Date(base + 240_000).toISOString(),
        departureIso: new Date(base + 300_000).toISOString(),
        durationSeconds: 60,
      },
    ],
  };
}

export function createAntarcticRoute(): Route {
  // Used for antimeridian + polar edge cases.
  return {
    schemaVersion: SCHEMA_VERSION,
    season: 2026,
    stops: [
      {
        locationId: 'fiji',
        arrivalIso: '2026-12-24T00:00:00.000Z',
        departureIso: '2026-12-24T00:05:00.000Z',
        durationSeconds: 300,
      },
      {
        locationId: 'samoa',
        arrivalIso: '2026-12-24T00:10:00.000Z',
        departureIso: '2026-12-24T00:15:00.000Z',
        durationSeconds: 300,
      },
    ],
  };
}
