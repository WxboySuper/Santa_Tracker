import { PUBLIC_ID_PATTERN, type ActivityId } from '@santa-tracker/contracts/ids';
import { ActivitySaveMigrationError } from './save-errors';
import type { ActivitySaveMigration } from './save';

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
  const descriptor = Object.getOwnPropertyDescriptor(migration, key);
  if (descriptor === undefined) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor)) {
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

function normalizeMigrationEntry(input: {
  migration: unknown;
  index: number;
}): ActivitySaveMigration {
  const { migration, index } = input;
  const description = `Migration at index ${index}`;
  if (typeof migration !== 'object' || migration === null || Array.isArray(migration)) {
    throw new ActivitySaveMigrationError(`${description} must be an object`);
  }
  const migrationRecord = migration as Record<string, unknown>;
  const activityId = getMigrationProperty({ migration: migrationRecord, key: 'activityId', description });
  assertActivityId(activityId, `${description} activity id`);
  const sourceVersion = {
    version: getMigrationProperty({ migration: migrationRecord, key: 'fromVersion', description }),
    description: `${description} source schema version`,
  };
  const targetVersion = {
    version: getMigrationProperty({ migration: migrationRecord, key: 'toVersion', description }),
    description: `${description} target schema version`,
  };
  assertPositiveVersion(sourceVersion);
  assertPositiveVersion(targetVersion);
  assertConsecutiveMigrationVersions(sourceVersion.version, targetVersion.version, description);
  const migrate = getOptionalMigrationProperty({ migration: migrationRecord, key: 'migrate', description });
  if (typeof migrate !== 'function') {
    throw new ActivitySaveMigrationError(`${description} migrate must be a function`);
  }
  return {
    activityId,
    fromVersion: sourceVersion.version,
    toVersion: targetVersion.version,
    migrate: migrate as ActivitySaveMigration['migrate'],
  };
}

/** Every registry entry is snapshotted and validated, including unused steps. */
export function normalizeMigrationRegistry(migrations: unknown): readonly ActivitySaveMigration[] {
  if (!Array.isArray(migrations)) {
    throw new ActivitySaveMigrationError('Migrations must be an array');
  }
  const normalized: ActivitySaveMigration[] = [];
  for (let index = 0; index < migrations.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(migrations, String(index));
    if (descriptor === undefined || !('value' in descriptor)) {
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
