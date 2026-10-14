import { createActivityId } from '@santa-tracker/contracts';
import { runInNewContext } from 'node:vm';
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
    expect(() => migrateActivitySave(null, 1, [])).toThrow(ActivitySaveMigrationError);
    expect(() => migrateActivitySave(save(), 1, undefined as never)).toThrow(
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
    expect(() => migrateActivitySave({ ...save(), payload: undefined }, 1, [])).toThrow(
      /must not be undefined/,
    );
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
    expect(() =>
      migrateActivitySave(save(), 1, [
        { activityId, fromVersion: 1, toVersion: 2, migrate: () => ({}), migrat: 'typo' } as never,
      ]),
    ).toThrow(/unknown keys/);
    const withExtraArrayKey = [
      { activityId, fromVersion: 1, toVersion: 2, migrate: () => ({}) },
    ];
    Object.assign(withExtraArrayKey, { unexpected: true });
    expect(() => migrateActivitySave(save(), 1, withExtraArrayKey)).toThrow(/extra array keys/);
    expect(() =>
      migrateActivitySave(save(), 1, [
        {
          activityId,
          fromVersion: 1,
          toVersion: 2,
          migrate: async () => {
            await Promise.resolve();
            return {};
          },
        },
      ]),
    ).toThrow(/migrate must be synchronous/);
  });

  it('accepts unknown JSON input and rejects inherited save fields', () => {
    const parsed: unknown = JSON.parse(JSON.stringify(save()));
    expect(migrateActivitySave(parsed, 1, [])).toEqual(save());

    const inherited = Object.create({
      activityId,
      schemaVersion: 1,
      savedAtIso: '2026-10-12T12:00:00.000Z',
      payload: {},
    }) as unknown;
    expect(() => migrateActivitySave(inherited, 1, [])).toThrow(/own payload/);
  });

  it('accepts only JSON-compatible payload values', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const payload of [
      new Date('2026-10-12T12:00:00.000Z'),
      new Map([['value', 1]]),
      Number.NaN,
      { missing: undefined },
      () => undefined,
      Symbol('value'),
      cycle,
    ]) {
      expect(() => migrateActivitySave(save(payload), 1, [])).toThrow(ActivitySaveMigrationError);
    }
    expect(() => migrateActivitySave(save(() => undefined), 1, [])).toThrow(/must be a JSON value/);
  });

  it('accepts plain objects and arrays from another JavaScript realm', () => {
    const foreignObject = runInNewContext('({ values: [1, { label: "snow" }] })') as Record<string, unknown>;
    const migrated = migrateActivitySave(save(foreignObject), 1, []);

    expect(migrated.payload).toEqual({ values: [1, { label: 'snow' }] });
  });

  it('rejects custom intermediate object prototypes', () => {
    const intermediate = Object.create(null) as object;
    const customObject = Object.create(intermediate) as Record<string, unknown>;

    expect(() => migrateActivitySave(save(customObject), 1, [])).toThrow(/plain JSON object/);
  });

  it('returns standard-prototype clones without exposing prototype-pollution keys', () => {
    const payload = JSON.parse('{"nested":{"values":[1]},"__proto__":{"polluted":true}}') as {
      nested: { values: number[] };
      __proto__: { polluted: boolean };
    };
    const migrated = migrateActivitySave(save(payload), 1, []);
    const migratedPayload = migrated.payload as typeof payload;

    expect(Object.getPrototypeOf(migratedPayload)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(migratedPayload.nested)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(migratedPayload.nested.values)).toBe(Array.prototype);
    expect(Object.hasOwn(migratedPayload, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('keeps array validation errors path-specific when proxy traps throw', () => {
    const throwingArray = new Proxy([1], {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') throw new Error('blocked descriptor');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(() => migrateActivitySave(save({ values: throwingArray }), 1, [])).toThrow(
      /\["values"\]\[0\].*must not be empty/,
    );
  });

  it('reports unambiguous paths and rejects excessive JSON nesting', () => {
    expect(() => migrateActivitySave(save({ 'a.b': undefined }), 1, [])).toThrow(/\["a\.b"\]/);

    let deeplyNested: unknown = null;
    for (let depth = 0; depth < 102; depth += 1) deeplyNested = { nested: deeplyNested };
    expect(() => migrateActivitySave(save(deeplyNested), 1, [])).toThrow(/maximum JSON depth of 100/);
  });

  it('copies the final migration output and extra envelope fields', () => {
    let retainedOutput: { values: number[] } | undefined;
    const source = { ...save(), metadata: { labels: ['device'] } };
    const migrated = migrateActivitySave(source, 2, [
      {
        activityId,
        fromVersion: 1,
        toVersion: 2,
        migrate: () => {
          retainedOutput = { values: [1] };
          return retainedOutput;
        },
      },
    ]);

    const migratedWithMetadata = migrated as typeof source;
    expect(migratedWithMetadata.metadata).toEqual({ labels: ['device'] });
    expect(migratedWithMetadata.metadata).not.toBe(source.metadata);
    expect(migrated.payload).not.toBe(retainedOutput);
    if (retainedOutput !== undefined) retainedOutput.values.push(2);
    expect(migrated.payload).toEqual({ values: [1] });
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
        { activityId, fromVersion: 1, toVersion: 2, migrate: () => ({ then: () => undefined }) },
      ]),
    ).toThrow(/synchronous/);
    expect(() =>
      migrateActivitySave(save(), 2, [
        { activityId, fromVersion: 1, toVersion: 2, migrate: () => undefined },
      ]),
    ).toThrow(/must return a payload/);
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
      '2026-10-12T12:00:00+14:01',
      '2026-10-12T12:00:00-12:01',
      '2026-10-12T12:00:00+23:00',
    ]) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).toThrow(/valid ISO date/);
    }
    for (const savedAtIso of ['2026-10-12T12:00:00+14:00', '2026-10-12T12:00:00-12:00']) {
      expect(() => migrateActivitySave({ ...save(), savedAtIso }, 1, [])).not.toThrow();
    }
  });
});
