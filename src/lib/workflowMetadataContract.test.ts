import {
  boundWorkflowMetadataForPersistence,
  isMetadataOnlyOutlookVersion,
  isValidWorkflowMetadata,
  MAX_OUTLOOK_VERSIONS,
} from './workflowMetadataContract';

const baseVersion = {
  version: 1,
  status: 'in-progress' as const,
  createdAt: '2026-07-13T00:00:00.000Z',
};

const baseMetadata = {
  id: 'WF-severe-day1-2026-07-13',
  workflowId: 'severe-day1',
  cycleDate: '2026-07-13',
  status: 'in-progress' as const,
  outlookVersions: [baseVersion],
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

describe('workflow metadata Firestore contract', () => {
  it('accepts metadata-only outlook versions', () => {
    expect(isMetadataOnlyOutlookVersion(baseVersion)).toBe(true);
    expect(isMetadataOnlyOutlookVersion({ ...baseVersion, derivedFrom: 1 })).toBe(true);
  });

  it('rejects payload-like or unknown nested fields', () => {
    expect(isMetadataOnlyOutlookVersion({ ...baseVersion, payloadJson: '{}' })).toBe(false);
    expect(isValidWorkflowMetadata({
      ...baseMetadata,
      outlookVersions: [{ ...baseVersion, data: { polygon: [] } }],
    })).toBe(false);
    expect(isValidWorkflowMetadata({ ...baseMetadata, unexpected: true })).toBe(false);
  });

  it(`rejects more than ${MAX_OUTLOOK_VERSIONS} nested entries`, () => {
    const versions = Array.from({ length: MAX_OUTLOOK_VERSIONS + 1 }, (_, index) => ({
      ...baseVersion,
      version: index + 1,
    }));

    expect(isValidWorkflowMetadata({ ...baseMetadata, outlookVersions: versions })).toBe(false);
  });

  it('rejects malformed version metadata and accepts the empty bounded list', () => {
    expect(isMetadataOnlyOutlookVersion({ ...baseVersion, version: 0 })).toBe(false);
    expect(isMetadataOnlyOutlookVersion({ ...baseVersion, status: 'draft' })).toBe(false);
    expect(isMetadataOnlyOutlookVersion({ ...baseVersion, derivedFrom: '1' })).toBe(false);
    expect(isValidWorkflowMetadata({ ...baseMetadata, outlookVersions: [] })).toBe(true);
  });

  it('bounds oversized workflow metadata for cloud persistence', () => {
    const versions = Array.from({ length: MAX_OUTLOOK_VERSIONS + 1 }, (_, index) => ({
      ...baseVersion,
      version: index + 1,
    }));

    const bounded = boundWorkflowMetadataForPersistence({ ...baseMetadata, outlookVersions: versions });

    expect(isValidWorkflowMetadata(bounded)).toBe(true);
    expect(bounded.outlookVersions).toHaveLength(MAX_OUTLOOK_VERSIONS);
    expect(bounded.outlookVersions[MAX_OUTLOOK_VERSIONS - 1].version).toBe(MAX_OUTLOOK_VERSIONS);
  });
});
