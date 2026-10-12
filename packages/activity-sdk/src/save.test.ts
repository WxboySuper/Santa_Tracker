import { createActivityId } from '@santa-tracker/contracts';
import { describe, expect, it } from 'vitest';
import { ActivitySaveMigrationError, migrateActivitySave, type ActivitySaveEnvelope } from './save';

const activityId = createActivityId('snowman-puzzle');
const otherActivityId = createActivityId('sleigh-runner');

function save(payload: unknown = { stars: 2 }): ActivitySaveEnvelope {
  return {
    activityId,
    schemaVersion: 1,
    savedAtIso: '2026-10-12T12:00:00.000Z',
    payload,
  };
}

describe('@santa-tracker/activity-sdk save migrations', () => {
  it('returns the same version with an isolated payload copy', () => {
    const source = save();
    const migrated = migrateActivitySave(source, 1, []);

    expect(migrated).toEqual(source);
    expect(migrated).not.toBe(source);
    expect(migrated.payload).toEqual(source.payload);
    expect(migrated.payload).not.toBe(source.payload);
  });

  it('applies consecutive activity-specific migrations and preserves envelope metadata', () => {
    const source = save({ points: 12 });
    const migrated = migrateActivitySave(source, 3, [
      {
        activityId,
        fromVersion: 1,
        toVersion: 2,
        migrate: (payload) => ({ score: (payload as { points: number }).points }),
      },
      {
        activityId,
        fromVersion: 2,
        toVersion: 3,
        migrate: (payload) => ({ score: (payload as { score: number }).score, bonus: 4 }),
      },
      {
        activityId: otherActivityId,
        fromVersion: 1,
        toVersion: 2,
        migrate: () => ({ ignored: true }),
      },
    ]);

    expect(migrated).toEqual({
      activityId,
      schemaVersion: 3,
      savedAtIso: source.savedAtIso,
      payload: { score: 12, bonus: 4 },
    });
    expect(source).toEqual(save({ points: 12 }));
  });

  it('does not apply another activity’s migration', () => {
    expect(() =>
      migrateActivitySave(save(), 2, [
        { activityId: otherActivityId, fromVersion: 1, toVersion: 2, migrate: () => ({}) },
      ]),
    ).toThrow(/No migration for activity snowman-puzzle from schema 1/);
  });

  it('rejects missing or ambiguous migration steps', () => {
    expect(() => migrateActivitySave(save(), 2, [])).toThrow(ActivitySaveMigrationError);

    const duplicate = { activityId, fromVersion: 1, toVersion: 2, migrate: () => ({}) };
    expect(() => migrateActivitySave(save(), 2, [duplicate, duplicate])).toThrow(
      /Multiple migrations/,
    );
  });

  it('rejects downgrade and invalid or non-consecutive versions', () => {
    expect(() => migrateActivitySave(save(), 1, [])).not.toThrow();
    expect(() => migrateActivitySave(save(), 0, [])).toThrow(
      /Target schema version must be a positive safe integer/,
    );
    expect(() => migrateActivitySave({ ...save(), schemaVersion: 0 }, 2, [])).toThrow(
      /Save schema version must be a positive safe integer/,
    );
    expect(() => migrateActivitySave({ ...save(), schemaVersion: 2 }, 1, [])).toThrow(
      /Cannot downgrade/,
    );
    expect(() =>
      migrateActivitySave(save(), 2, [
        { activityId, fromVersion: 1, toVersion: 3, migrate: () => ({}) },
      ]),
    ).toThrow(/must advance exactly one schema version/);
  });

  it('rejects invalid envelopes and does not expose payload aliases to migrations', () => {
    expect(() => migrateActivitySave(null as never, 1, [])).toThrow(ActivitySaveMigrationError);    expect(() => migrateActivitySave(save(), 1, undefined as never)).toThrow(
      /Migrations must be an array/,
    );
    for (const savedAtIso of ['invalid', '10/12/2026', 'October 12, 2026', '2026-02-30T12:00:00Z']) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).toThrow(/valid ISO date/);
    }
    for (const savedAtIso of [
      '2026-10-12T12:00:00Z',
      '2026-10-12T12:00:00.123456Z',
      '2026-10-12T12:00:00+05:30',
      '2026-10-12T12:00:00-0500',
    ]) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).not.toThrow();
    }
    const source = save({ points: 1 });
    migrateActivitySave(source, 2, [
      {
        activityId,
        fromVersion: 1,
        toVersion: 2,
        migrate: (payload) => {
          (payload as { points: number }).points = 2;
          return payload;
        },
      },
    ]);
    expect(source.payload).toEqual({ points: 1 });
  });

  it('requires the payload field and a contract-shaped activity id', () => {
    const { payload: _dropped, ...truncated } = save();
    expect(() => migrateActivitySave(truncated as never, 1, [])).toThrow(/payload/);
    expect(() => migrateActivitySave({ ...save(), activityId: '' as never }, 1, [])).toThrow(
      /activity id/,
    );
    expect(
      () => migrateActivitySave({ ...save(), activityId: 'Has Spaces' as never }, 1, []),
    ).toThrow(/activity id/);
  });

  it('validates every migration entry, including sparse and unused steps', () => {
    const registry = [
      { activityId, fromVersion: 1, toVersion: 2, migrate: (payload: unknown) => payload },
      { activityId, fromVersion: 2, toVersion: 4, migrate: (payload: unknown) => payload },
    ];
    expect(() => migrateActivitySave(save(), 2, registry)).toThrow(/exactly one schema version/);
    expect(() =>
      migrateActivitySave(save(), 1, [null as never]),
    ).toThrow(ActivitySaveMigrationError);
    // eslint-disable-next-line no-sparse-arrays
    expect(() => migrateActivitySave(save(), 1, [,] as never)).toThrow(
      ActivitySaveMigrationError,
    );
    expect(() =>
      migrateActivitySave(save(), 1, [
        { activityId, fromVersion: 1, toVersion: 2 } as never,
      ]),
    ).toThrow(/migrate must be a function/);
  });

  it('wraps clone and migration failures and rejects async migrations', () => {
    expect(() =>
      migrateActivitySave(save({ handler: () => undefined }), 2, [
        { activityId, fromVersion: 1, toVersion: 2, migrate: (payload: unknown) => payload },
      ]),
    ).toThrow(ActivitySaveMigrationError);
    expect(() =>
      migrateActivitySave(save(), 2, [
        {
          activityId,
          fromVersion: 1,
          toVersion: 2,
          migrate: () => {
            throw new TypeError('boom');
          },
        },
      ]),
    ).toThrow(ActivitySaveMigrationError);
    expect(() =>
      migrateActivitySave(save(), 2, [
        // eslint-disable-next-line @typescript-eslint/require-await
        { activityId, fromVersion: 1, toVersion: 2, migrate: (async (p: unknown) => p) as never },
      ]),
    ).toThrow(/synchronous/);
  });

  it('keeps strict ISO semantics, including leap years and colon offsets', () => {
    for (const savedAtIso of ['2024-02-29T12:00:00Z', '2026-10-12T12:00:00.000Z']) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).not.toThrow();
    }
    for (const savedAtIso of [
      '2025-02-29T12:00:00Z',
      '2026-10-12T24:00:00Z',
      '2026-10-12T12:00:00',
      '2026-10-12T12:00:00+05:60',
    ]) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).toThrow(/valid ISO date/);
    }
  });
});
