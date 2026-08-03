import { MAX_OUTLOOK_VERSIONS } from '../lib/workflowMetadataContract';
import type { CycleMetadata } from './workflow';
import {
  createAwarenessMetadata,
  getAwarenessRecommendations,
  isCurrentAwarenessConsent,
  WORKFLOW_AWARENESS_CONSENT_VERSION,
} from './workflowAwareness';

const base = {
  cycleId: 'cycle',
  workflowId: 'severe-day1',
  cycleDate: '2026-07-13',
  outlookVersions: [],
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T01:00:00.000Z',
};

test('requires the current consent version', () => {
  expect(isCurrentAwarenessConsent({ enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION })).toBe(true);
  expect(isCurrentAwarenessConsent({ enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION - 1 })).toBe(false);
  expect(isCurrentAwarenessConsent({ enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION })).toBe(false);
});

test(`bounds outlookVersions to ${MAX_OUTLOOK_VERSIONS} entries for Firestore`, () => {
  const versions = Array.from({ length: MAX_OUTLOOK_VERSIONS + 5 }, (_, index) => ({
    version: index + 1,
    status: 'in-progress' as const,
    createdAt: `2026-07-13T${String(index).padStart(2, '0')}:00:00.000Z`,
  }));
  const metadata: CycleMetadata = {
    id: 'cycle',
    workflowId: 'severe-day1',
    cycleDate: '2026-07-13',
    status: 'in-progress',
    outlookVersions: versions,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
  };

  const awareness = createAwarenessMetadata(metadata);

  expect(awareness.outlookVersions).toHaveLength(MAX_OUTLOOK_VERSIONS);
  expect(awareness.outlookVersions[0].version).toBe(6);
  expect(awareness.outlookVersions[MAX_OUTLOOK_VERSIONS - 1].version).toBe(MAX_OUTLOOK_VERSIONS);
});

test(`clamps outlook version numbers to ${MAX_OUTLOOK_VERSIONS} for Firestore`, () => {
  const metadata: CycleMetadata = {
    id: 'cycle',
    workflowId: 'severe-day1',
    cycleDate: '2026-07-13',
    status: 'in-progress',
    outlookVersions: [{
      version: MAX_OUTLOOK_VERSIONS + 1,
      status: 'in-progress',
      derivedFrom: MAX_OUTLOOK_VERSIONS,
      createdAt: '2026-07-13T00:00:00.000Z',
    }],
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
  };

  const awareness = createAwarenessMetadata(metadata);

  expect(awareness.outlookVersions).toEqual([{
    version: MAX_OUTLOOK_VERSIONS,
    status: 'in-progress',
    derivedFrom: MAX_OUTLOOK_VERSIONS,
    createdAt: '2026-07-13T00:00:00.000Z',
  }]);
});

test('does not recommend completed cycles and sorts unfinished cycles newest first', () => {
  const recommendations = getAwarenessRecommendations([
    { ...base, cycleId: 'completed', status: 'completed' },
    { ...base, cycleId: 'old', status: 'in-progress', updatedAt: '2026-07-13T00:00:00.000Z' },
    { ...base, cycleId: 'new', status: 'in-progress', updatedAt: '2026-07-13T02:00:00.000Z' },
  ]);

  expect(recommendations.map((record) => record.cycleId)).toEqual(['new', 'old']);
});
