import { SCHEMA_VERSION, type Snapshot } from '@santa-tracker/contracts';
import { createDeterministicRoute } from './routes';

export function createDeterministicSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const route = createDeterministicRoute();
  return {
    schemaVersion: SCHEMA_VERSION,
    publicationId: 'pub-deterministic-001',
    season: 2026,
    createdAtIso: '2026-12-01T00:00:00.000Z',
    checksum: 'sha256:deterministic-checksum-001',
    route,
    ...overrides,
  };
}

