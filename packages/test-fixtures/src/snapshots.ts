import { SCHEMA_VERSION, createPublicationId, createSnapshotId, type Snapshot } from '@santa-tracker/contracts';
import { createDeterministicRoute } from './routes';

export function createDeterministicSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const route = createDeterministicRoute();
  return {
    schemaVersion: SCHEMA_VERSION,
    publicationId: createPublicationId('pub-deterministic-001'),
    snapshotId: createSnapshotId('snapshot-deterministic-001'),
    season: 2026,
    author: 'fixture',
    validationReport: { valid: true, issueCount: 0 },
    createdAtIso: '2026-12-01T00:00:00.000Z',
    checksum: 'sha256:deterministic-checksum-001',
    route,
    ...overrides,
  };
}
