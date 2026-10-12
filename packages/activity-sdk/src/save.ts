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

const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isValidIsoDateTime(value: string): boolean {
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (match === null) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const timezone = offset!;
  const offsetHours = timezone === 'Z' ? 0 : Number(timezone.slice(1, 3));
  const offsetMinutes = timezone === 'Z' ? 0 : Number(timezone.slice(-2));
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth[month - 1]! &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHours <= 23 && offsetMinutes <= 59 &&
    !Number.isNaN(Date.parse(value))
  );
}

function assertSaveEnvelope(save: ActivitySaveEnvelope): void {
  if (save == null || typeof save !== 'object') {
    throw new ActivitySaveMigrationError('Invalid activity save envelope');
  }
  assertPositiveVersion(save.schemaVersion, 'Save schema version');
  if (typeof save.savedAtIso !== 'string' || !isValidIsoDateTime(save.savedAtIso)) {
    throw new ActivitySaveMigrationError('Save timestamp must be a valid ISO date');
  }
}

function assertMigrations(migrations: readonly ActivitySaveMigration[]): void {
  if (!Array.isArray(migrations)) {
    throw new ActivitySaveMigrationError('Migrations must be an array');
  }
}

function indexMigrations(
  migrations: readonly ActivitySaveMigration[],
  activityId: ActivityId,
): Map<number, ActivitySaveMigration> {
  const indexed = new Map<number, ActivitySaveMigration>();
  for (const migration of migrations) {
    if (migration.activityId !== activityId) continue;
    if (indexed.has(migration.fromVersion)) {
      throw new ActivitySaveMigrationError(
        `Multiple migrations for activity ${activityId} from schema ${migration.fromVersion}`,
      );
    }
    indexed.set(migration.fromVersion, migration);
  }
  return indexed;
}

function applyMigration(
  migration: ActivitySaveMigration | undefined,
  activityId: ActivityId,
  schemaVersion: number,
  payload: unknown,
): unknown {
  if (migration === undefined) {
    throw new ActivitySaveMigrationError(
      `No migration for activity ${activityId} from schema ${schemaVersion}`,
    );
  }
  if (migration.toVersion !== schemaVersion + 1) {
    throw new ActivitySaveMigrationError(
      `Migration for activity ${activityId} must advance exactly one schema version`,
    );
  }
  assertPositiveVersion(migration.fromVersion, 'Migration source schema version');
  assertPositiveVersion(migration.toVersion, 'Migration target schema version');
  const isolatedPayload = payload !== null && typeof payload === 'object'
    ? structuredClone(payload)
    : payload;
  return migration.migrate(isolatedPayload);
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
  assertSaveEnvelope(save);
  assertMigrations(migrations);
  assertPositiveVersion(targetVersion, 'Target schema version');

  if (save.schemaVersion > targetVersion) {
    throw new ActivitySaveMigrationError(
      `Cannot downgrade activity ${save.activityId} from schema ${save.schemaVersion} to ${targetVersion}`,
    );
  }

  const indexedMigrations = indexMigrations(migrations, save.activityId);
  let schemaVersion = save.schemaVersion;
  let payload = save.payload;

  while (schemaVersion < targetVersion) {
    const migration = indexedMigrations.get(schemaVersion);
    payload = applyMigration(migration, save.activityId, schemaVersion, payload);
    schemaVersion += 1;
  }

  return { ...save, schemaVersion, payload };
}
