import type {
  WorkflowId,
  CycleId,
  CycleStatus,
  OutlookStatus,
  OutlookVersion,
  StandardGrouping,
  Grouping,
  WorkflowMetadata,
  CycleMetadata,
  WorkflowPackageMetadata,
  Package,
} from './workflow';

import { WORKFLOW_SCHEMA_VERSION, createCustomGrouping } from './workflow';

describe('WORKFLOW_SCHEMA_VERSION', () => {
  it('is a valid semver string', () => {
    expect(WORKFLOW_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is defined and non-empty', () => {
    expect(WORKFLOW_SCHEMA_VERSION).toBeTruthy();
  });
});

describe('CycleStatus', () => {
  const validStatuses: CycleStatus[] = [
    'in-progress',
    'completed',
    'completed-with-omissions',
  ];

  it.each(validStatuses)('includes "%s"', (status) => {
    const cycle: CycleMetadata = {
      id: 'WF-sev-20260613',
      workflowId: 'severe-day1',
      cycleDate: '2026-06-13',
      status,
      outlookVersions: [],
      createdAt: '2026-06-13T12:00:00Z',
      updatedAt: '2026-06-13T12:00:00Z',
    };
    expect(cycle.status).toBe(status);
  });
});

describe('OutlookStatus', () => {
  const validStatuses: OutlookStatus[] = [
    'in-progress',
    'completed',
    'skipped',
    'omitted',
  ];

  it.each(validStatuses)('includes "%s"', (status) => {
    const version: OutlookVersion = {
      version: 1,
      status,
      createdAt: '2026-06-13T12:00:00Z',
    };
    expect(version.status).toBe(status);
  });
});

describe('OutlookVersion', () => {
  it('supports original outlook (no derivedFrom)', () => {
    const version: OutlookVersion = {
      version: 1,
      status: 'completed',
      createdAt: '2026-06-13T12:00:00Z',
    };
    expect(version.derivedFrom).toBeUndefined();
    expect(version.version).toBe(1);
  });

  it('supports derived outlook with parent reference', () => {
    const original: OutlookVersion = {
      version: 1,
      status: 'completed',
      createdAt: '2026-06-13T12:00:00Z',
    };
    const update: OutlookVersion = {
      version: 2,
      status: 'in-progress',
      derivedFrom: original.version,
      createdAt: '2026-06-13T15:00:00Z',
    };
    expect(update.derivedFrom).toBe(1);
    expect(update.version).toBe(2);
  });

  it('distinguishes derived outlooks from originals', () => {
    const original: OutlookVersion = {
      version: 1,
      status: 'completed',
      createdAt: '2026-06-13T12:00:00Z',
    };
    const derived: OutlookVersion = {
      version: 2,
      status: 'in-progress',
      derivedFrom: 1,
      createdAt: '2026-06-13T16:00:00Z',
    };

    const isDerived = (v: OutlookVersion) => v.derivedFrom !== undefined;
    expect(isDerived(original)).toBe(false);
    expect(isDerived(derived)).toBe(true);
  });
});

describe('StandardGrouping', () => {
  const expected: StandardGrouping[] = ['day1', 'day2', 'day3', 'day4-8'];

  it.each(expected)('includes "%s"', (grouping) => {
    const workflow: WorkflowMetadata = {
      id: 'severe-day1',
      label: 'Severe Convective Day 1',
      groupings: [grouping],
    };
    expect(workflow.groupings).toContain(grouping);
  });
});

describe('Grouping', () => {
  it('accepts standard groupings', () => {
    const groupings: Grouping[] = ['day1', 'day2', 'day3', 'day4-8'];
    expect(groupings).toHaveLength(4);
  });

  it('accepts custom groupings', () => {
    const groupings: Grouping[] = [
      'day1',
      createCustomGrouping('fire-weather'),
      createCustomGrouping('marine'),
    ];
    expect(groupings).toContain('fire-weather');
    expect(groupings).toContain('marine');
  });
});

describe('WorkflowMetadata', () => {
  it('can be constructed with standard groupings', () => {
    const workflow: WorkflowMetadata = {
      id: 'severe-day1',
      label: 'Severe Convective Day 1',
      groupings: ['day1'],
    };
    expect(workflow.id).toBe('severe-day1');
    expect(workflow.groupings).toEqual(['day1']);
  });
});

describe('CycleMetadata', () => {
  it('supports all status states', () => {
    const statuses: CycleStatus[] = [
      'in-progress',
      'completed',
      'completed-with-omissions',
    ];
    for (const status of statuses) {
      const cycle: CycleMetadata = {
        id: `WF-test-${status}`,
        workflowId: 'test',
        cycleDate: '2026-06-13',
        status,
        outlookVersions: [],
        createdAt: '2026-06-13T12:00:00Z',
        updatedAt: '2026-06-13T12:00:00Z',
      };
      expect(cycle.status).toBe(status);
    }
  });

  it('can hold multiple outlook versions', () => {
    const versions: OutlookVersion[] = [
      { version: 1, status: 'completed', createdAt: '2026-06-13T12:00:00Z' },
      { version: 2, status: 'in-progress', derivedFrom: 1, createdAt: '2026-06-13T16:00:00Z' },
    ];
    const cycle: CycleMetadata = {
      id: 'WF-sev-20260613',
      workflowId: 'severe-day1',
      cycleDate: '2026-06-13',
      status: 'in-progress',
      outlookVersions: versions,
      createdAt: '2026-06-13T12:00:00Z',
      updatedAt: '2026-06-13T16:00:00Z',
    };
    expect(cycle.outlookVersions).toHaveLength(2);
    expect(cycle.outlookVersions[1].derivedFrom).toBe(1);
  });
});

describe('WorkflowPackageMetadata', () => {
  it('supports standalone cycle (no derivedFromCycleId)', () => {
    const pkg: WorkflowPackageMetadata = {
      workflowId: 'severe-day1',
      cycleId: 'WF-sev-20260613',
      version: 1,
      status: 'completed',
      includesDiscussions: false,
      includesStyleSnapshots: true,
    };
    expect(pkg.derivedFromCycleId).toBeUndefined();
  });

  it('supports derived cycle with previous-cycle reference', () => {
    const pkg: WorkflowPackageMetadata = {
      workflowId: 'severe-day1',
      cycleId: 'WF-sev-20260613-v2',
      version: 2,
      status: 'in-progress',
      includesDiscussions: true,
      includesStyleSnapshots: false,
      derivedFromCycleId: 'WF-sev-20260613',
    };
    expect(pkg.derivedFromCycleId).toBe('WF-sev-20260613');
  });
});

describe('Package', () => {
  it('can be constructed with metadata and cycles', () => {
    const pkg: Package = {
      metadata: {
        workflowId: 'severe-day1',
        cycleId: 'WF-sev-20260613',
        version: 1,
        status: 'completed',
        includesDiscussions: true,
        includesStyleSnapshots: true,
      },
      cycles: [
        {
          id: 'WF-sev-20260613',
          workflowId: 'severe-day1',
          cycleDate: '2026-06-13',
          status: 'completed',
          outlookVersions: [
            { version: 1, status: 'completed', createdAt: '2026-06-13T12:00:00Z' },
          ],
          createdAt: '2026-06-13T12:00:00Z',
          updatedAt: '2026-06-13T18:00:00Z',
        },
      ],
    };
    expect(pkg.cycles).toHaveLength(1);
    expect(pkg.metadata.status).toBe('completed');
  });
});

describe('Acceptance criteria validation', () => {
  it('updates remain inside a cycle (outlookVersion tracks within CycleMetadata)', () => {
    const cycle: CycleMetadata = {
      id: 'WF-sev-20260613',
      workflowId: 'severe-day1',
      cycleDate: '2026-06-13',
      status: 'in-progress',
      outlookVersions: [
        { version: 1, status: 'completed', createdAt: '2026-06-13T12:00:00Z' },
        { version: 2, status: 'in-progress', derivedFrom: 1, createdAt: '2026-06-13T16:00:00Z' },
      ],
      createdAt: '2026-06-13T12:00:00Z',
      updatedAt: '2026-06-13T16:00:00Z',
    };
    // Both versions belong to the same cycle
    expect(cycle.outlookVersions.every((v) => v.version >= 1)).toBe(true);
    expect(cycle.outlookVersions[1].derivedFrom).toBe(1);
  });

  it('derived new outlooks are distinguishable via derivedFrom', () => {
    const versions: OutlookVersion[] = [
      { version: 1, status: 'completed', createdAt: '2026-06-13T12:00:00Z' },
      { version: 2, status: 'in-progress', derivedFrom: 1, createdAt: '2026-06-13T16:00:00Z' },
      { version: 3, status: 'skipped', derivedFrom: 2, createdAt: '2026-06-13T20:00:00Z' },
    ];
    const originals = versions.filter((v) => v.derivedFrom === undefined);
    const derived = versions.filter((v) => v.derivedFrom !== undefined);
    expect(originals).toHaveLength(1);
    expect(derived).toHaveLength(2);
    expect(derived[0].derivedFrom).toBe(1);
    expect(derived[1].derivedFrom).toBe(2);
  });

  it('incomplete and completed-with-omissions states are supported', () => {
    const incomplete: CycleMetadata = {
      id: 'WF-sev-20260613',
      workflowId: 'severe-day1',
      cycleDate: '2026-06-13',
      status: 'in-progress',
      outlookVersions: [],
      createdAt: '2026-06-13T12:00:00Z',
      updatedAt: '2026-06-13T12:00:00Z',
    };
    const omissions: CycleMetadata = {
      id: 'WF-sev-20260614',
      workflowId: 'severe-day1',
      cycleDate: '2026-06-14',
      status: 'completed-with-omissions',
      outlookVersions: [
        { version: 1, status: 'completed', createdAt: '2026-06-14T12:00:00Z' },
        { version: 2, status: 'omitted', createdAt: '2026-06-14T12:00:00Z' },
      ],
      createdAt: '2026-06-14T12:00:00Z',
      updatedAt: '2026-06-14T18:00:00Z',
    };
    expect(incomplete.status).toBe('in-progress');
    expect(omissions.status).toBe('completed-with-omissions');
  });
});
