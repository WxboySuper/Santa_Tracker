import { ActivitySaveMigrationError, getErrorMessage } from './save-errors';
import { assertJsonArray } from './save-json-array';
import { assertJsonObject } from './save-json-object';

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

function assertJsonContainerCompatible(
  objectValue: object,
  path: string,
  ancestors: WeakSet<object>,
): void {
  if (Array.isArray(objectValue)) {
    assertJsonArray(objectValue, path, ancestors, assertJsonCompatible);
    return;
  }
  assertJsonObject(objectValue, path, ancestors, assertJsonCompatible);
}

function assertJsonObjectCompatible(
  objectValue: object,
  path: string,
  ancestors: WeakSet<object>,
): void {
  if (ancestors.has(objectValue)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain cycles`);
  }
  ancestors.add(objectValue);
  try {
    assertJsonContainerCompatible(objectValue, path, ancestors);
  } finally {
    ancestors.delete(objectValue);
  }
}

function rethrowJsonCompatibilityError(error: unknown, path: string): never {
  if (error instanceof ActivitySaveMigrationError) throw error;
  throw new ActivitySaveMigrationError(
    `Save value at ${path} must be JSON-compatible (${getErrorMessage(error)})`,
  );
}

export function assertJsonCompatible(
  value: unknown,
  path = '$',
  ancestors = new WeakSet(),
): void {
  try {
    if (assertJsonPrimitive(value, path)) return;
    assertJsonObjectCompatible(value as object, path, ancestors);
  } catch (error) {
    rethrowJsonCompatibilityError(error, path);
  }
}

export function clonePayload(payload: unknown): unknown {
  try {
    assertJsonCompatible(payload);
    const serialized = JSON.stringify(payload);
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Cannot migrate activity save: payload is not JSON-compatible (${getErrorMessage(error)})`,
    );
  }
}
