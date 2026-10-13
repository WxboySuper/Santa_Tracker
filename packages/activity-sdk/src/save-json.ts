import { ActivitySaveMigrationError, getErrorMessage } from './save-errors';
import { assertJsonArray } from './save-json-array';
import { assertJsonObject } from './save-json-object';

const MAX_JSON_DEPTH = 100;

function assertFiniteJsonNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a finite JSON number`);
  }
}

function cloneJsonPrimitive(value: unknown, path: string): string | number | boolean | null {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      assertFiniteJsonNumber(value, path);
      return Object.is(value, -0) ? 0 : value;
    case 'object':
      if (value === null) return null;
      break;
    default:
      throw new ActivitySaveMigrationError(`Save value at ${path} must be JSON-compatible`);
  }
  throw new ActivitySaveMigrationError(`Save value at ${path} must be JSON-compatible`);
}

function assertJsonContainerCompatible(
  objectValue: object,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): unknown {
  const validateNested = (
    value: unknown,
    nestedPath: string,
    nestedAncestors: WeakSet<object>,
  ): unknown => {
    return assertJsonCompatibleAtDepth(value, nestedPath, nestedAncestors, depth + 1);
  };
  if (Array.isArray(objectValue)) {
    return assertJsonArray(objectValue, path, ancestors, validateNested);
  }
  return assertJsonObject(objectValue, path, ancestors, validateNested);
}

function assertJsonObjectCompatible(
  objectValue: object,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): unknown {
  if (ancestors.has(objectValue)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain cycles`);
  }
  ancestors.add(objectValue);
  try {
    return assertJsonContainerCompatible(objectValue, path, ancestors, depth);
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
): unknown {
  try {
    if (depth > MAX_JSON_DEPTH) {
      throw new ActivitySaveMigrationError(
        `Save value at ${path} exceeds maximum JSON depth of ${MAX_JSON_DEPTH}`,
      );
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      return cloneJsonPrimitive(value, path);
    }
    return assertJsonObjectCompatible(value as object, path, ancestors, depth);
  } catch (error) {
    rethrowJsonCompatibilityError(error, path);
  }
}

export function assertJsonCompatible(
  value: unknown,
  path = '$',
  ancestors = new WeakSet(),
): unknown {
  return assertJsonCompatibleAtDepth(value, path, ancestors, 0);
}

export function clonePayload(payload: unknown): unknown {
  try {
    const safePayload = assertJsonCompatible(payload);
    const serialized = JSON.stringify(safePayload);
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Cannot migrate activity save: payload is not JSON-compatible (${getErrorMessage(error)})`,
    );
  }
}
