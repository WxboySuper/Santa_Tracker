import type { ActivityId } from '@santa-tracker/contracts/ids';
import { ActivitySaveMigrationError, getErrorMessage } from './save-errors';
import { assertJsonCompatible, clonePayload } from './save-json';
import { assertIsoTimestamp } from './save-timestamp';
import {
  assertActivityId,
  assertPositiveVersion,
  indexMigrations,
  normalizeMigrationRegistry,
} from './save-registry';
import type { ActivitySaveMigration } from './save-types';
import { getOwnDataPropertyDescriptor, isEnumerableDataProperty, isStringRecord } from './shared-guards';

export { ActivitySaveMigrationError } from './save-errors';
export type { ActivitySaveMigration } from './save-types';
/**
 * Device-local activity progress. Saves intentionally contain no visitor or
 * account identity so activities remain usable without a server profile.
 */
export type ActivitySaveEnvelope<TPayload = unknown> = {
  activityId: ActivityId;
  schemaVersion: number;
  savedAtIso: string;
  payload: TPayload;
  /** Forward-compatible JSON metadata is preserved by `migrateActivitySave`. */
  [metadata: string]: unknown;
};

/** Validation boundary: accepts unknown device-local JSON, narrows on success. */
function assertSaveEnvelope(save: unknown): asserts save is ActivitySaveEnvelope {
  if (!isStringRecord(save)) {
    throw new ActivitySaveMigrationError('Invalid activity save envelope');
  }
  const payload = getOwnSaveProperty(save, 'payload');
  const activityId = getOwnSaveProperty(save, 'activityId');
  const schemaVersion = getOwnSaveProperty(save, 'schemaVersion');
  const savedAtIso = getOwnSaveProperty(save, 'savedAtIso');
  if (payload === undefined) {
    throw new ActivitySaveMigrationError('Save envelope payload must not be undefined');
  }
  assertActivityId(activityId);
  assertPositiveVersion({ version: schemaVersion, description: 'Save schema version' });
  assertIsoTimestamp(savedAtIso);
  assertJsonCompatible(save);
}

function getOwnSaveProperty(
  save: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = getOwnDataPropertyDescriptor(save, key);
  const message = `Save envelope must include its own ${key} value`;
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivitySaveMigrationError(message);
  }
  return descriptor.value;
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
  try {
    return clonePayload(next);
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) {
      throw new ActivitySaveMigrationError(
        `Migration for activity ${step.activityId} from schema ${step.schemaVersion} produced invalid payload (${error.message})`,
      );
    }
    throw error;
  }
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
  const validatedMigrations = normalizeMigrationRegistry(migrations);
  assertPositiveVersion({ version: targetVersion, description: 'Target schema version' });

  if (save.schemaVersion > targetVersion) {
    throw new ActivitySaveMigrationError(
      `Cannot downgrade activity ${save.activityId} from schema ${save.schemaVersion} to ${targetVersion}`,
    );
  }

  const isolatedSave = clonePayload(save) as ActivitySaveEnvelope;

  const indexedMigrations = indexMigrations({ migrations: validatedMigrations, activityId: isolatedSave.activityId });
  let schemaVersion = isolatedSave.schemaVersion;
  let payload: unknown = isolatedSave.payload;

  while (schemaVersion < targetVersion) {
    const migration = indexedMigrations.get(schemaVersion);
    payload = runMigrationStep({ migration, activityId: isolatedSave.activityId, schemaVersion, payload });
    schemaVersion += 1;
  }

  // Forward-compatible envelope metadata is validated and cloned with the save.
  return { ...isolatedSave, schemaVersion, payload: payload as TOutput };
}
