import {
  serializeWorkflowPackage,
  deserializeWorkflowPackage,
  migrateLegacyForecastToWorkflowPackage,
  migrateLegacyForecastToSerializedPackage,
  validateWorkflowPackage,
} from './workflowSerialization';
import type {
  Package,
  SerializedWorkflowPackage,
  CycleMetadata,
} from '../types/workflow';
import type { GFCForecastSaveData } from '../types/outlooks';

describe('workflowSerialization', () => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const makeLegacySaveData = (overrides?: Partial<GFCForecastSaveData>): GFCForecastSaveData => ({
    version: '0.5.0',
    type: 'forecast-cycle',
    timestamp: '2026-04-21T12:00:00.000Z',
    forecastCycle: {
      days: {
        1: {
          day: 1,
          data: {
            tornado: [['5%', []]],
            wind: [['15%', []]],
          },
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-21',
            issuanceTime: '1300',
            lowProbabilityOutlooks: ['tornado'],
          },
        },
        2: {
          day: 2,
          data: {
            categorical: [['MRGL', []]],
          },
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-22',
            issuanceTime: '1300',
            lowProbabilityOutlooks: [],
          },
        },
      },
      currentDay: 1,
      cycleDate: '2026-04-21',
    },
    ...overrides,
  });

  const makePackage = (): Package => {
    const now = '2026-04-21T12:00:00.000Z';
    const cycleMetadata: CycleMetadata = {
      id: 'WF-severe-day1-2026-04-21',
      workflowId: 'severe-day1',
      cycleDate: '2026-04-21',
      status: 'in-progress',
      outlookVersions: [{ version: 1, status: 'completed', createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };

    return {
      metadata: {
        workflowId: 'severe-day1',
        cycleId: cycleMetadata.id,
        version: 1,
        status: 'in-progress',
        includesDiscussions: false,
        includesStyleSnapshots: false,
      },
      cycles: [cycleMetadata],
    };
  };

  // ---------------------------------------------------------------------------
  // serializeWorkflowPackage / deserializeWorkflowPackage
  // ---------------------------------------------------------------------------

  describe('round-trip serialization', () => {
    test('preserves all metadata fields', () => {
      const pkg = makePackage();
      const serialized = serializeWorkflowPackage(pkg);
      const deserialized = deserializeWorkflowPackage(serialized);

      expect(deserialized.metadata.workflowId).toBe(pkg.metadata.workflowId);
      expect(deserialized.metadata.cycleId).toBe(pkg.metadata.cycleId);
      expect(deserialized.metadata.version).toBe(pkg.metadata.version);
      expect(deserialized.metadata.status).toBe(pkg.metadata.status);
      expect(deserialized.cycles).toHaveLength(1);
      expect(deserialized.cycles[0].id).toBe(pkg.cycles[0].id);
      expect(deserialized.cycles[0].workflowId).toBe(pkg.cycles[0].workflowId);
      expect(deserialized.cycles[0].status).toBe(pkg.cycles[0].status);
    });

    test('preserves outlookVersions', () => {
      const pkg = makePackage();
      pkg.cycles[0].outlookVersions = [
        { version: 1, status: 'completed', createdAt: '2026-04-21T12:00:00.000Z' },
        { version: 2, status: 'in-progress', derivedFrom: 1, createdAt: '2026-04-21T15:00:00.000Z' },
      ];

      const serialized = serializeWorkflowPackage(pkg);
      const deserialized = deserializeWorkflowPackage(serialized);

      expect(deserialized.cycles[0].outlookVersions).toHaveLength(2);
      expect(deserialized.cycles[0].outlookVersions[1].derivedFrom).toBe(1);
    });

    test('preserves schemaVersion and version strings', () => {
      const pkg = makePackage();
      pkg.metadata.version = 5;

      const serialized = serializeWorkflowPackage(pkg);

      expect(serialized.schemaVersion).toBe('1.0.0');
      expect(serialized.version).toBe('5');
    });

    test('handles empty cycles array', () => {
      const pkg: Package = {
        metadata: {
          workflowId: 'test',
          cycleId: 'WF-test-2026-04-21',
          version: 1,
          status: 'in-progress',
          includesDiscussions: false,
          includesStyleSnapshots: false,
        },
        cycles: [],
      };

      const serialized = serializeWorkflowPackage(pkg);
      const deserialized = deserializeWorkflowPackage(serialized);

      expect(deserialized.cycles).toHaveLength(0);
    });

    test('handles multiple cycles', () => {
      const now = '2026-04-21T12:00:00.000Z';
      const pkg: Package = {
        metadata: {
          workflowId: 'severe-day1',
          cycleId: 'WF-severe-day1-2026-04-21',
          version: 1,
          status: 'completed',
          includesDiscussions: true,
          includesStyleSnapshots: false,
        },
        cycles: [
          {
            id: 'WF-severe-day1-2026-04-21',
            workflowId: 'severe-day1',
            cycleDate: '2026-04-21',
            status: 'completed',
            outlookVersions: [{ version: 1, status: 'completed', createdAt: now }],
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'WF-severe-day1-2026-04-22',
            workflowId: 'severe-day1',
            cycleDate: '2026-04-22',
            status: 'in-progress',
            outlookVersions: [{ version: 1, status: 'in-progress', createdAt: now }],
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      const serialized = serializeWorkflowPackage(pkg);
      const deserialized = deserializeWorkflowPackage(serialized);

      expect(deserialized.cycles).toHaveLength(2);
      expect(deserialized.cycles[1].cycleDate).toBe('2026-04-22');
    });
  });

  // ---------------------------------------------------------------------------
  // migrateLegacyForecastToWorkflowPackage
  // ---------------------------------------------------------------------------

  describe('migrateLegacyForecastToWorkflowPackage', () => {
    test('produces correct cycleId from workflowId and cycleDate', () => {
      const legacy = makeLegacySaveData();
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy, 'severe-day1');

      expect(pkg.cycles[0].id).toBe('WF-severe-day1-2026-04-21');
      expect(pkg.metadata.cycleId).toBe('WF-severe-day1-2026-04-21');
      expect(pkg.metadata.workflowId).toBe('severe-day1');
    });

    test('defaults workflowId to "default" when not provided', () => {
      const legacy = makeLegacySaveData();
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.cycles[0].id).toBe('WF-default-2026-04-21');
    });

    test('sets status to in-progress for migrated cycles', () => {
      const legacy = makeLegacySaveData();
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.cycles[0].status).toBe('in-progress');
      expect(pkg.metadata.status).toBe('in-progress');
    });

    test('creates one OutlookVersion per existing day', () => {
      const legacy = makeLegacySaveData();
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      // The legacy data has days 1 and 2
      expect(pkg.cycles[0].outlookVersions).toHaveLength(2);
      expect(pkg.cycles[0].outlookVersions[0].version).toBe(1);
      expect(pkg.cycles[0].outlookVersions[1].version).toBe(2);
    });

    test('creates a single OutlookVersion when no days exist', () => {
      const legacy = makeLegacySaveData({ forecastCycle: undefined });
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.cycles[0].outlookVersions).toHaveLength(1);
      expect(pkg.cycles[0].outlookVersions[0].version).toBe(1);
    });

    test('detects discussions in legacy data', () => {
      const legacy = makeLegacySaveData();
      if (legacy.forecastCycle?.days?.[1]) {
        (legacy.forecastCycle.days[1] as { discussion?: unknown }).discussion = {
          mode: 'diy',
          diyContent: 'Test discussion',
        };
      }
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.metadata.includesDiscussions).toBe(true);
    });

    test('attaches detached custom geometry and appearance to the owning grouping', () => {
      const legacy = makeLegacySaveData();
      const customLayers = {
        schemaVersion: '1.0.0' as const,
        layers: [{
          schemaVersion: '1.0.0' as const, id: 'layer-1' as never, label: 'Fire', order: 0,
          categories: [{ id: 'cat-1' as never, label: 'Critical', order: 0, style: { fillColor: '#ef4444', fillOpacity: .6, strokeColor: '#123456', strokeOpacity: .4, strokeWidth: 4, hatch: 'crosshatch' as const } }],
          features: [{ type: 'Feature' as const, id: 'feature-1', geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1' as never, categoryId: 'cat-1' as never, title: 'Critical' } }],
          createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
        }],
      };
      legacy.forecastCycle!.days[1]!.customLayers = customLayers;

      const serialized = migrateLegacyForecastToSerializedPackage(legacy, 'severe-day1');
      const grouped = serialized.cycles[0].groupingData['day1-v1'];

      expect(grouped.customLayers).toEqual(customLayers);
      expect(grouped.customLayers).not.toBe(customLayers);
      expect(serialized.metadata.includesStyleSnapshots).toBe(true);
    });

    test('sets version to 1', () => {
      const legacy = makeLegacySaveData();
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.metadata.version).toBe(1);
    });

    test('is deterministic — same input produces same output', () => {
      const legacy = makeLegacySaveData();
      const pkg1 = migrateLegacyForecastToWorkflowPackage(legacy);
      const pkg2 = migrateLegacyForecastToWorkflowPackage(legacy);

      // Cycle IDs should be identical
      expect(pkg1.cycles[0].id).toBe(pkg2.cycles[0].id);
      // Status should be identical
      expect(pkg1.cycles[0].status).toBe(pkg2.cycles[0].status);
      // Outlook version count should be identical
      expect(pkg1.cycles[0].outlookVersions).toHaveLength(pkg2.cycles[0].outlookVersions.length);
    });

    test('handles legacy data with no forecastCycle field', () => {
      const legacy: GFCForecastSaveData = {
        version: '0.4.0',
        type: 'single-day',
        timestamp: '2026-04-21T12:00:00.000Z',
      };
      const pkg = migrateLegacyForecastToWorkflowPackage(legacy);

      expect(pkg.cycles).toHaveLength(1);
      expect(pkg.cycles[0].cycleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('preserves day4-8 outlook data in groupings', () => {
      const legacy = makeLegacySaveData();
      if (legacy.forecastCycle) {
        legacy.forecastCycle.days[4] = {
          day: 4,
          data: { 'day4-8': [['15%', []]] },
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-24',
            issuanceTime: '0600',
            lowProbabilityOutlooks: [],
          },
        };
      }
      const serialized = migrateLegacyForecastToSerializedPackage(legacy);

      expect(serialized.cycles[0].outlookVersions).toHaveLength(3);
      expect(serialized.cycles[0].groupings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ grouping: 'day1', day: 1 }),
          expect.objectContaining({ grouping: 'day2', day: 2 }),
          expect.objectContaining({ grouping: 'day4-8', day: 4 }),
        ]),
      );
      expect(serialized.cycles[0].groupingData['day4-8-v1']?.data['day4-8']).toEqual([['15%', []]]);
    });

    test('keeps first day4-8 entry when multiple legacy days map to day4-8', () => {
      const legacy = makeLegacySaveData();
      if (legacy.forecastCycle) {
        legacy.forecastCycle.days[4] = {
          day: 4,
          data: { 'day4-8': [['15%', []]] },
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-24',
            issuanceTime: '0600',
            lowProbabilityOutlooks: [],
          },
        };
        legacy.forecastCycle.days[5] = {
          day: 5,
          data: { 'day4-8': [['30%', []]] },
          metadata: {
            issueDate: '2026-04-21',
            validDate: '2026-04-25',
            issuanceTime: '0600',
            lowProbabilityOutlooks: [],
          },
        };
      }

      const serialized = migrateLegacyForecastToSerializedPackage(legacy);
      const day48Grouping = serialized.cycles[0].groupings.find(({ grouping }) => grouping === 'day4-8');

      expect(day48Grouping?.day).toBe(4);
      expect(serialized.cycles[0].groupingData['day4-8-v1']?.day).toBe(4);
      expect(serialized.cycles[0].groupingData['day4-8-v1']?.data['day4-8']).toEqual([['15%', []]]);
    });
  });

  // ---------------------------------------------------------------------------
  // validateWorkflowPackage
  // ---------------------------------------------------------------------------

  describe('validateWorkflowPackage', () => {
    test('returns true for a valid SerializedWorkflowPackage', () => {
      const pkg = makePackage();
      const serialized = serializeWorkflowPackage(pkg);

      expect(validateWorkflowPackage(serialized)).toBe(true);
    });

    test('returns false for null', () => {
      expect(validateWorkflowPackage(null)).toBe(false);
    });

    test('returns false for non-object', () => {
      expect(validateWorkflowPackage('string')).toBe(false);
    });

    test('returns false when missing schemaVersion', () => {
      const data = { version: '1', metadata: { workflowId: 'x', cycleId: 'y' }, cycles: [] };
      expect(validateWorkflowPackage(data)).toBe(false);
    });

    test('returns false when missing cycles array', () => {
      const data = { schemaVersion: '1.0.0', version: '1', metadata: { workflowId: 'x', cycleId: 'y' } };
      expect(validateWorkflowPackage(data)).toBe(false);
    });

    test('returns false when metadata is missing workflowId', () => {
      const data = { schemaVersion: '1.0.0', version: '1', metadata: { cycleId: 'y' }, cycles: [] };
      expect(validateWorkflowPackage(data)).toBe(false);
    });

    test('returns false when metadata is missing cycleId', () => {
      const data = { schemaVersion: '1.0.0', version: '1', metadata: { workflowId: 'x' }, cycles: [] };
      expect(validateWorkflowPackage(data)).toBe(false);
    });

    test('returns false for empty object', () => {
      expect(validateWorkflowPackage({})).toBe(false);
    });
  });
});
