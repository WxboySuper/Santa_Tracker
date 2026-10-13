import { PUBLIC_ID_PATTERN, type ActivityId } from '@santa-tracker/contracts/ids';
import { ActivitySaveMigrationError } from './save-errors';
import type { ActivitySaveMigration } from './save-types';
import {
  getOwnArrayLength,
  getOwnDataPropertyDescriptor,
  isArrayValue,
  isAllowedJsonArrayKey,
  isEnumerableDataProperty,
} from './shared-guards';

export function assertPositiveVersion(input: {
  version: unknown;
  description: string;
}): asserts input is { version: number; description: string } {
  if (
    !Number.isSafeInteger(input.version) ||
    (input.version as number) < 1
  ) {
    throw new ActivitySaveMigrationError(`${input.description} must be a positive safe integer`);
  }
}

export function assertActivityId(
  value: unknown,
  description = 'Save activity id',
): asserts value is ActivityId {
  if (typeof value !== 'string' || !PUBLIC_ID_PATTERN.test(value)) {
    throw new ActivitySaveMigrationError(`${description} must match the activity id contract`);
  }
}

type MigrationPropertyRequest = {
  migration: Record<string, unknown>;
  key: string;
  description: string;
};

function getMigrationPropertyDescriptor(
  input: MigrationPropertyRequest,
): PropertyDescriptor | undefined {
  const { migration, key, description } = input;
  const descriptor = getOwnDataPropertyDescriptor(migration, key);
  if (descriptor === undefined) return undefined;
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivitySaveMigrationError(`${description} must be an own data property`);
  }
  return descriptor;
}

function getMigrationProperty(input: MigrationPropertyRequest): unknown {
  const descriptor = getMigrationPropertyDescriptor(input);
  if (descriptor === undefined) {
    throw new ActivitySaveMigrationError(`${input.description} must be an own data property`);
  }
  return descriptor.value;
}

function getOptionalMigrationProperty(input: MigrationPropertyRequest): unknown {
  return getMigrationPropertyDescriptor(input)?.value;
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

function isMigrationRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false;
  if (typeof value !== 'object') return false;
  return !isArrayValue(value);
}

function readMigrationVersion(input: {
  migration: Record<string, unknown>;
  key: 'fromVersion' | 'toVersion';
  description: string;
}): number {
  const { migration, key, description } = input;
  const version = {
    version: getMigrationProperty({ migration, key, description }),
    description: `${description} ${key === 'fromVersion' ? 'source' : 'target'} schema version`,
  };
  assertPositiveVersion(version);
  return version.version;
}

function getMigrationHandler(
  migration: Record<string, unknown>,
  description: string,
): ActivitySaveMigration['migrate'] {
  const handler = getOptionalMigrationProperty({ migration, key: 'migrate', description });
  if (typeof handler !== 'function') {
    throw new ActivitySaveMigrationError(`${description} migrate must be a function`);
  }
  return handler as ActivitySaveMigration['migrate'];
}

const MIGRATION_KEYS = new Set(['activityId', 'fromVersion', 'toVersion', 'migrate']);

function assertMigrationRecordKeys(migration: Record<string, unknown>, description: string): void {
  let keys: PropertyKey[];
  try {
    keys = Reflect.ownKeys(migration);
  } catch {
    throw new ActivitySaveMigrationError(`${description} must be an inspectable object`);
  }
  if (keys.some((key) => typeof key !== 'string' || !MIGRATION_KEYS.has(key))) {
    throw new ActivitySaveMigrationError(`${description} must not contain unknown keys`);
  }
}

function assertMigrationArrayKeys(migrations: unknown[], length: number): void {
  let keys: PropertyKey[];
  try {
    keys = Reflect.ownKeys(migrations);
  } catch {
    throw new ActivitySaveMigrationError('Migrations must be an inspectable array');
  }
  const hasExtraKey = keys.some((key) => !isAllowedJsonArrayKey(key, length));
  if (hasExtraKey) throw new ActivitySaveMigrationError('Migrations must not contain extra array keys');
}

function normalizeMigrationEntry(input: {
  migration: unknown;
  index: number;
}): ActivitySaveMigration {
  const { migration, index } = input;
  const description = `Migration at index ${index}`;
  if (!isMigrationRecord(migration)) {
    throw new ActivitySaveMigrationError(`${description} must be an object`);
  }
  const migrationRecord = migration;
  assertMigrationRecordKeys(migrationRecord, description);
  const activityId = getMigrationProperty({ migration: migrationRecord, key: 'activityId', description });
  assertActivityId(activityId, `${description} activity id`);
  const fromVersion = readMigrationVersion({ migration: migrationRecord, key: 'fromVersion', description });
  const toVersion = readMigrationVersion({ migration: migrationRecord, key: 'toVersion', description });
  assertConsecutiveMigrationVersions(fromVersion, toVersion, description);
  return {
    activityId,
    fromVersion,
    toVersion,
    migrate: getMigrationHandler(migrationRecord, description),
  };
}

/** Every registry entry is snapshotted and validated, including unused steps. */
export function normalizeMigrationRegistry(migrations: unknown): readonly ActivitySaveMigration[] {
  if (!isArrayValue(migrations)) {
    throw new ActivitySaveMigrationError('Migrations must be an array');
  }
  const length = getOwnArrayLength(migrations);
  if (length === undefined) throw new ActivitySaveMigrationError('Migrations must be an array');
  assertMigrationArrayKeys(migrations, length);
  const normalized: ActivitySaveMigration[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = getOwnDataPropertyDescriptor(migrations, String(index));
    if (!isEnumerableDataProperty(descriptor)) {
      throw new ActivitySaveMigrationError(`Migration at index ${index} must be an own data property`);
    }
    normalized.push(normalizeMigrationEntry({ migration: descriptor.value, index }));
  }
  return normalized;
}

export function indexMigrations({
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
