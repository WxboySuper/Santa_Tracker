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

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertFiniteJsonNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a finite JSON number`);
  }
}

function assertJsonPrimitive(value: unknown, path: string): boolean {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      assertFiniteJsonNumber(value, path);
      return true;
    case 'object':
      return value === null;
    default:
      throw new ActivitySaveMigrationError(`Save value at ${path} must be JSON-compatible`);
  }
}

function assertJsonProperty({
  value,
  key,
  path,
  ancestors,
}: {
  value: object;
  key: string;
  path: string;
  ancestors: WeakSet<object>;
}): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  if (!descriptor.enumerable) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  if (!('value' in descriptor)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  assertJsonCompatible(descriptor.value, path, ancestors);
}

function assertJsonArrayEntries(
  value: unknown[],
  path: string,
  ancestors: WeakSet<object>,
): void {
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!hasOwn(value, key)) {
      throw new ActivitySaveMigrationError(`Save value at ${path}[${index}] must not be empty`);
    }
    assertJsonProperty({ value, key, path: `${path}[${index}]`, ancestors });
  }
}

function isJsonArrayIndexKey(key: PropertyKey, length: number): boolean {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/.test(key)
    && Number(key) < length;
}

function isAllowedJsonArrayKey(key: PropertyKey, length: number): boolean {
  return key === 'length' || isJsonArrayIndexKey(key, length);
}

function assertJsonArrayKeys(value: unknown[], path: string): void {
  const hasExtraKey = Reflect.ownKeys(value).some(
    (key) => !isAllowedJsonArrayKey(key, value.length),
  );
  if (hasExtraKey) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain extra array keys`);
  }
}

function assertJsonObjectProperties(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
    }
    assertJsonProperty({ value, key, path: `${path}.${key}`, ancestors });
  }
}

function assertJsonObject(value: object, path: string, ancestors: WeakSet<object>): void {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  assertJsonObjectProperties(value, path, ancestors);
}

function assertJsonCompatible(value: unknown, path = '$', ancestors = new WeakSet<object>()): void {
  if (assertJsonPrimitive(value, path)) return;

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain cycles`);
  }

  ancestors.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      if (Object.getPrototypeOf(objectValue) !== Array.prototype) {
        throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON array`);
      }
      assertJsonArrayEntries(objectValue, path, ancestors);
      assertJsonArrayKeys(objectValue, path);
      return;
    }
    assertJsonObject(objectValue, path, ancestors);
  } finally {
    ancestors.delete(objectValue);
  }
}

function assertPositiveVersion(input: {
  version: unknown;
  description: string;
}): asserts input is { version: number; description: string } {
  if (
    typeof input.version !== 'number' ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1
  ) {
    throw new ActivitySaveMigrationError(`${input.description} must be a positive safe integer`);
  }
}

function assertActivityId(
  value: unknown,
  description = 'Save activity id',
): asserts value is ActivityId {
  if (typeof value !== 'string' || !PUBLIC_ID_PATTERN.test(value)) {
    throw new ActivitySaveMigrationError(`${description} must match the activity id contract`);
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

type IsoCalendarDate = Pick<IsoParts, 'year' | 'month' | 'day'>;
type IsoClockTime = Pick<IsoParts, 'hour' | 'minute' | 'second'>;

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function parseIsoParts(value: string): IsoParts | undefined {
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (match === null) return undefined;
  return {
    // The regex guarantees each required capture. These fallbacks keep a
    // future mismatch invalid without relying on non-null assertions.
    year: Number(match[1] ?? 'NaN'),
    month: Number(match[2] ?? 'NaN'),
    day: Number(match[3] ?? 'NaN'),
    hour: Number(match[4] ?? 'NaN'),
    minute: Number(match[5] ?? 'NaN'),
    second: Number(match[6] ?? 'NaN'),
    offset: match[7] ?? '',
  };
}

function daysInMonth({ year, month }: IsoCalendarDate): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2 && isLeapYear) return 29;
  return lengths[month - 1] ?? 0;
}

function isValidCalendarDate({ year, month, day }: IsoCalendarDate): boolean {
  if (!Number.isSafeInteger(year) || year < 0) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth({ year, month, day });
}

function isValidClockTime({ hour, minute, second }: IsoClockTime): boolean {
  return hour >= 0 && hour <= 23
    && minute >= 0 && minute <= 59
    && second >= 0 && second <= 59;
}

function isValidOffset({ offset }: Pick<IsoParts, 'offset'>): boolean {
  if (offset === 'Z') return true;
  const digits = offset.replace(':', '');
  if (digits.length !== 5) return false;
  const sign = digits.startsWith('-') ? -1 : 1;
  const hours = Number(digits.slice(1, 3));
  const minutes = Number(digits.slice(3, 5));
  const totalMinutes = sign * (hours * 60 + minutes);
  return minutes <= 59 && totalMinutes >= -720 && totalMinutes <= 840;
}

function isValidIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = parseIsoParts(value);
  if (parts === undefined) return false;
  if (!isValidCalendarDate(parts)) return false;
  if (!isValidClockTime(parts)) return false;
  return isValidOffset(parts);
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
  for (const key of ['payload', 'activityId', 'schemaVersion', 'savedAtIso']) {
    const value = getOwnSaveProperty(save, key);
    if (key === 'payload' && value === undefined) {
      throw new ActivitySaveMigrationError('Save envelope payload must not be undefined');
    }
  }
  assertActivityId(save.activityId);
  assertPositiveVersion({ version: save.schemaVersion, description: 'Save schema version' });
  assertIsoTimestamp(save.savedAtIso);
  assertJsonCompatible(save);
}

function getOwnSaveProperty(
  save: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(save, key);
  const message = `Save envelope must include its own ${key} value`;
  if (descriptor === undefined) {
    throw new ActivitySaveMigrationError(message);
  }
  if (!descriptor.enumerable) {
    throw new ActivitySaveMigrationError(message);
  }
  if (!('value' in descriptor)) {
    throw new ActivitySaveMigrationError(message);
  }
  return descriptor.value;
}

function assertMigrationEntry(input: {
  migration: unknown;
  index: number;
}): asserts input is { migration: ActivitySaveMigration; index: number } {
  const { migration, index } = input;
  const description = `Migration at index ${index}`;
  if (!isRecord(migration)) {
    throw new ActivitySaveMigrationError(`${description} must be an object`);
  }
  assertActivityId(migration.activityId, `${description} activity id`);
  const sourceVersion = {
    version: migration.fromVersion,
    description: `${description} source schema version`,
  };
  const targetVersion = {
    version: migration.toVersion,
    description: `${description} target schema version`,
  };
  assertPositiveVersion(sourceVersion);
  assertPositiveVersion(targetVersion);
  assertConsecutiveMigrationVersions(sourceVersion.version, targetVersion.version, description);
  if (typeof migration.migrate !== 'function') {
    throw new ActivitySaveMigrationError(`${description} migrate must be a function`);
  }
}

function assertConsecutiveMigrationVersions(
  fromVersion: number,
  toVersion: number,
  description: string,
): void {
  if (toVersion !== fromVersion + 1) {
    throw new ActivitySaveMigrationError(`${description} must advance exactly one schema version`);
  }
}

/** Every registry entry is validated, including steps no save currently needs. */
function assertMigrationRegistry(migrations: unknown): asserts migrations is readonly ActivitySaveMigration[] {
  if (!Array.isArray(migrations)) {
    throw new ActivitySaveMigrationError('Migrations must be an array');
  }
  for (let index = 0; index < migrations.length; index += 1) {
    assertMigrationEntry({ migration: migrations[index], index });
  }
}

function indexMigrations({
  migrations,
  activityId,
}: {
  migrations: readonly ActivitySaveMigration[];
  activityId: ActivityId;
}): Map<number, ActivitySaveMigration> {
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
  try {
    assertJsonCompatible(payload);
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new Error('Value has no JSON representation');
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Cannot migrate activity save: payload is not JSON-compatible (${getErrorMessage(error)})`,
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObjectLike(value: unknown): boolean {
  const kind = typeof value;
  return value !== null && (kind === 'object' || kind === 'function');
}

function isThenable(value: unknown): boolean {
  if (!isObjectLike(value)) return false;
  try {
    return typeof (value as { then?: unknown }).then === 'function';
  } catch {
    // A throwing `then` getter is still an unusable asynchronous result. Treat
    // it as thenable so the caller reports the stable migration error below.
    return true;
  }
}

function observeNativePromiseRejection(value: unknown): boolean {
  try {
    void Promise.prototype.then.call(
      value as Promise<unknown>,
      undefined,
      () => undefined,
    );
    return true;
  } catch {
    // The native method rejects non-Promise receivers without reading `then`.
    return false;
  }
}

type MigrationStep = {
  migration: ActivitySaveMigration | undefined;
  activityId: ActivityId;
  schemaVersion: number;
  payload: unknown;
};

function getMigration({ migration, activityId, schemaVersion }: MigrationStep): ActivitySaveMigration {
  if (migration === undefined) {
    throw new ActivitySaveMigrationError(
      `No migration for activity ${activityId} from schema ${schemaVersion}`,
    );
  }
  return migration;
}

function applyMigration(
  migration: ActivitySaveMigration,
  payload: unknown,
  { activityId, schemaVersion }: MigrationStep,
): unknown {
  try {
    return migration.migrate(payload);
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Migration for activity ${activityId} from schema ${schemaVersion} failed (${getErrorMessage(error)})`,
    );
  }
}

function assertSynchronousMigrationResult(
  value: unknown,
  { activityId, schemaVersion }: MigrationStep,
): void {
  if (value === undefined) {
    throw new ActivitySaveMigrationError(
      `Migration for activity ${activityId} from schema ${schemaVersion} must return a payload`,
    );
  }
  // Observe native Promise rejections before rejecting async migrations
  // synchronously. The intrinsic doesn't assimilate arbitrary thenables.
  if (!observeNativePromiseRejection(value) && !isThenable(value)) return;
  throw new ActivitySaveMigrationError(
    `Migration for activity ${activityId} from schema ${schemaVersion} must be synchronous`,
  );
}

function runMigrationStep(step: MigrationStep): unknown {
  const migration = getMigration(step);
  const isolatedPayload = clonePayload(step.payload);
  const next = applyMigration(migration, isolatedPayload, step);
  assertSynchronousMigrationResult(next, step);
  return clonePayload(next);
}

/**
 * Upgrade a device-local save through consecutive, activity-specific
 * migrations. The input envelope and its payload are never mutated: migrations
 * receive an isolated copy and the returned envelope owns a cloned payload,
 * including when no migration step runs.
 */
export function migrateActivitySave<TOutput = unknown>(
  save: unknown,
  targetVersion: number,
  migrations: readonly ActivitySaveMigration[],
): ActivitySaveEnvelope<TOutput> {
  assertSaveEnvelope(save);
  assertMigrationRegistry(migrations);
  assertPositiveVersion({ version: targetVersion, description: 'Target schema version' });

  if (save.schemaVersion > targetVersion) {
    throw new ActivitySaveMigrationError(
      `Cannot downgrade activity ${save.activityId} from schema ${save.schemaVersion} to ${targetVersion}`,
    );
  }

  const isolatedSave = clonePayload(save) as ActivitySaveEnvelope;

  const indexedMigrations = indexMigrations({ migrations, activityId: isolatedSave.activityId });
  let schemaVersion = isolatedSave.schemaVersion;
  let payload: unknown = isolatedSave.payload;

  while (schemaVersion < targetVersion) {
    const migration = indexedMigrations.get(schemaVersion);
    payload = runMigrationStep({ migration, activityId: isolatedSave.activityId, schemaVersion, payload });
    schemaVersion += 1;
  }

  return { ...isolatedSave, schemaVersion, payload: payload as TOutput };
}
