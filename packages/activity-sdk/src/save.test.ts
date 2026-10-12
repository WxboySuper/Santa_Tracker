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
  it('returns the same version without requiring a migration', () => {
    const source = save();
    const migrated = migrateActivitySave(source, 1, []);

    expect(migrated).toEqual(source);
    expect(migrated).not.toBe(source);
    expect(migrated.payload).toBe(source.payload);
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
    expect(() => migrateActivitySave(null as never, 1, [])).toThrow(ActivitySaveMigrationError);
    expect(() => migrateActivitySave(save(), 1, undefined as never)).toThrow(
      /Migrations must be an array/,
    );
    expect(() => migrateActivitySave({ ...save(), savedAtIso: 'invalid' }, 1, [])).toThrow(
      /valid ISO date/,
    );
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
});
