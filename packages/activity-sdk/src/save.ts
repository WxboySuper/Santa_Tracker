import type { ActivityId } from '@santa-tracker/contracts';

/**
 * Device-local activity progress. Saves intentionally contain no visitor or
 * account identity so activities remain usable without a server profile.
 */
export type ActivitySaveEnvelope<TPayload = unknown> = {
  activityId: ActivityId;
  schemaVersion: number;
  savedAtIso: string;
  payload: TPayload;
};

/** A pure, single-version step for upgrading one activity's saved payload. */
export type ActivitySaveMigration = {
  activityId: ActivityId;
  fromVersion: number;
  toVersion: number;
  migrate: (payload: unknown) => unknown;
};

export class ActivitySaveMigrationError extends Error {
  readonly name = 'ActivitySaveMigrationError';
}

function assertPositiveVersion(version: number, description: string): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new ActivitySaveMigrationError(`${description} must be a positive safe integer`);
  }
}

/**
 * Upgrade a device-local save through consecutive, activity-specific
 * migrations. The input envelope is not mutated. Payload validation remains
 * the activity's responsibility after the final version is reached.
 */
export function migrateActivitySave(
  save: ActivitySaveEnvelope,
  targetVersion: number,
  migrations: readonly ActivitySaveMigration[],
): ActivitySaveEnvelope {
  assertPositiveVersion(save.schemaVersion, 'Save schema version');
  assertPositiveVersion(targetVersion, 'Target schema version');

  if (save.schemaVersion > targetVersion) {
    throw new ActivitySaveMigrationError(
      `Cannot downgrade activity ${save.activityId} from schema ${save.schemaVersion} to ${targetVersion}`,
    );
  }

  let schemaVersion = save.schemaVersion;
  let payload = save.payload;

  while (schemaVersion < targetVersion) {
    const candidates = migrations.filter(
      (migration) =>
        migration.activityId === save.activityId && migration.fromVersion === schemaVersion,
    );

    if (candidates.length !== 1) {
      throw new ActivitySaveMigrationError(
        candidates.length === 0
          ? `No migration for activity ${save.activityId} from schema ${schemaVersion}`
          : `Multiple migrations for activity ${save.activityId} from schema ${schemaVersion}`,
      );
    }

    const migration = candidates[0];
    if (migration?.toVersion !== schemaVersion + 1) {
      throw new ActivitySaveMigrationError(
        `Migration for activity ${save.activityId} must advance exactly one schema version`,
      );
    }

    assertPositiveVersion(migration.toVersion, 'Migration target schema version');
    payload = migration.migrate(payload);
    schemaVersion = migration.toVersion;
  }

  return { ...save, schemaVersion, payload };
}
