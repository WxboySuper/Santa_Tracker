import { ActivitySaveMigrationError, getErrorMessage } from './save-errors';
import { assertJsonArray } from './save-json-array';
import { assertJsonObject } from './save-json-object';

const MAX_JSON_DEPTH = 100;

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
  depth: number,
): void {
  const validateNested = (
    value: unknown,
    nestedPath: string,
    nestedAncestors: WeakSet<object>,
  ): void => {
    assertJsonCompatibleAtDepth(value, nestedPath, nestedAncestors, depth + 1);
  };
  if (Array.isArray(objectValue)) {
    assertJsonArray(objectValue, path, ancestors, validateNested);
    return;
  }
  assertJsonObject(objectValue, path, ancestors, validateNested);
}

function assertJsonObjectCompatible(
  objectValue: object,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): void {
  if (ancestors.has(objectValue)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain cycles`);
  }
  ancestors.add(objectValue);
  try {
    assertJsonContainerCompatible(objectValue, path, ancestors, depth);
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

function assertJsonCompatibleAtDepth(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): void {
  try {
    if (depth > MAX_JSON_DEPTH) {
      throw new ActivitySaveMigrationError(
        `Save value at ${path} exceeds maximum JSON depth of ${MAX_JSON_DEPTH}`,
      );
    }
    if (assertJsonPrimitive(value, path)) return;
    assertJsonObjectCompatible(value as object, path, ancestors, depth);
  } catch (error) {
    rethrowJsonCompatibilityError(error, path);
  }
}

export function assertJsonCompatible(
  value: unknown,
  path = '$',
  ancestors = new WeakSet(),
): void {
  assertJsonCompatibleAtDepth(value, path, ancestors, 0);
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
