import { PUBLIC_ID_PATTERN, type ActivityId } from '@santa-tracker/contracts';

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

/**
 * A pure, synchronous single-version step for upgrading one activity's saved
 * payload. `migrate` must return the next payload directly; async migrations
 * are rejected at runtime so a `Promise` is never stored as a payload.
 */
export type ActivitySaveMigration = {
  activityId: ActivityId;
  fromVersion: number;
  toVersion: number;
  migrate: (payload: unknown) => unknown;
};

export class ActivitySaveMigrationError extends Error {
  readonly name = 'ActivitySaveMigrationError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPositiveVersion(version: unknown, description: string): asserts version is number {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw new ActivitySaveMigrationError(`${description} must be a positive safe integer`);
  }
}

function assertActivityId(value: unknown): asserts value is ActivityId {
  if (typeof value !== 'string' || !PUBLIC_ID_PATTERN.test(value)) {
    throw new ActivitySaveMigrationError('Save activity id must match the activity id contract');
  }
}

type IsoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offset: string;
};

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function parseIsoParts(value: string): IsoParts | undefined {
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (match === null) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined ||
    offset === undefined
  ) {
    return undefined;
  }
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
    offset,
  };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1] ?? 0;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isSafeInteger(year) || year < 0) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function isValidClockTime(hour: number, minute: number, second: number): boolean {
  return hour <= 23 && minute <= 59 && second <= 59;
}

function isValidOffset(offset: string): boolean {
  if (offset === 'Z') return true;
  const digits = offset.replace(':', '');
  if (digits.length !== 5) return false;
  const hours = Number(digits.slice(1, 3));
  const minutes = Number(digits.slice(3, 5));
  return hours <= 23 && minutes <= 59;
}

function isValidIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = parseIsoParts(value);
  if (parts === undefined) return false;
  if (!isValidCalendarDate(parts.year, parts.month, parts.day)) return false;
  if (!isValidClockTime(parts.hour, parts.minute, parts.second)) return false;
  return isValidOffset(parts.offset);
}

function assertIsoTimestamp(value: unknown): void {
  if (!isValidIsoDateTime(value)) {
    throw new ActivitySaveMigrationError('Save timestamp must be a valid ISO date');
  }
}

/** Validation boundary: accepts unknown device-local JSON, narrows on success. */
function assertSaveEnvelope(save: unknown): asserts save is ActivitySaveEnvelope {
  if (!isRecord(save)) {
    throw new ActivitySaveMigrationError('Invalid activity save envelope');
  }
  if (!('payload' in save)) {
    throw new ActivitySaveMigrationError('Save envelope must include a payload');
  }
  assertActivityId(save.activityId);
  assertPositiveVersion(save.schemaVersion, 'Save schema version');
  assertIsoTimestamp(save.savedAtIso);
}

function assertMigrationEntry(migration: unknown, index: number): asserts migration is ActivitySaveMigration {
  const description = `Migration at index ${index}`;
  if (!isRecord(migration)) {
    throw new ActivitySaveMigrationError(`${description} must be an object`);
  }
  assertActivityId(migration.activityId);
  assertPositiveVersion(migration.fromVersion, `${description} source schema version`);
  assertPositiveVersion(migration.toVersion, `${description} target schema version`);
  if (migration.toVersion !== migration.fromVersion + 1) {
    throw new ActivitySaveMigrationError(
      `${description} must advance exactly one schema version`,
    );
  }
  if (typeof migration.migrate !== 'function') {
    throw new ActivitySaveMigrationError(`${description} migrate must be a function`);
  }
}

/** Every registry entry is validated, including steps no save currently needs. */
function assertMigrationRegistry(migrations: unknown): asserts migrations is readonly ActivitySaveMigration[] {
  if (!Array.isArray(migrations)) {
    throw new ActivitySaveMigrationError('Migrations must be an array');
  }
  for (let index = 0; index < migrations.length; index += 1) {
    assertMigrationEntry(migrations[index], index);
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

function clonePayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object') return payload;
  try {
    return structuredClone(payload);
  } catch (error) {
    throw new ActivitySaveMigrationError(
      `Cannot migrate activity save: payload is not cloneable (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function isThenable(value: unknown): boolean {
  if (value === null) return false;
  const kind = typeof value;
  if (kind !== 'object' && kind !== 'function') return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

function runMigrationStep(
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
  const isolatedPayload = clonePayload(payload);
  let next: unknown;
  try {
    next = migration.migrate(isolatedPayload);
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Migration for activity ${activityId} from schema ${schemaVersion} failed (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (isThenable(next)) {
    throw new ActivitySaveMigrationError(
      `Migration for activity ${activityId} from schema ${schemaVersion} must be synchronous`,
    );
  }
  return next;
}

/**
 * Upgrade a device-local save through consecutive, activity-specific
 * migrations. The input envelope and its payload are never mutated: migrations
 * receive an isolated copy and the returned envelope owns a cloned payload,
 * including when no migration step runs.
 */
export function migrateActivitySave<TInput, TOutput = unknown>(
  save: ActivitySaveEnvelope<TInput>,
  targetVersion: number,
  migrations: readonly ActivitySaveMigration[],
): ActivitySaveEnvelope<TOutput> {
  assertSaveEnvelope(save);
  assertMigrationRegistry(migrations);
  assertPositiveVersion(targetVersion, 'Target schema version');

  if (save.schemaVersion > targetVersion) {
    throw new ActivitySaveMigrationError(
      `Cannot downgrade activity ${save.activityId} from schema ${save.schemaVersion} to ${targetVersion}`,
    );
  }

  const indexedMigrations = indexMigrations(migrations, save.activityId);
  let schemaVersion = save.schemaVersion;
  let payload: unknown = clonePayload(save.payload);

  while (schemaVersion < targetVersion) {
    const migration = indexedMigrations.get(schemaVersion);
    payload = runMigrationStep(migration, save.activityId, schemaVersion, payload);
    schemaVersion += 1;
  }

  return { ...save, schemaVersion, payload: payload as TOutput };
}

export { isValidIsoDateTime };
