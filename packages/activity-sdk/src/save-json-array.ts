import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';
import { getOwnArrayLength, hasOnlyAllowedJsonArrayKeys, hasOwn } from './shared-guards';

const MAX_JSON_ARRAY_LENGTH = 100_000;

function assertJsonArrayKeys(value: unknown[], path: string, length: number): void {
  if (length > MAX_JSON_ARRAY_LENGTH) {
    throw new ActivitySaveMigrationError(
      `Save array at ${path} exceeds maximum length of ${MAX_JSON_ARRAY_LENGTH}`,
    );
  }
  let keys: PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON array`);
  }
  if (!hasOnlyAllowedJsonArrayKeys(keys, length)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain extra array keys`);
  }
}

function cloneJsonArrayItems(input: {
  value: unknown[];
  path: string;
  length: number;
  ancestors: WeakSet<object>;
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => unknown;
}): unknown[] {
  const { value, path, length, ancestors, validate } = input;
  const clone: unknown[] = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!hasOwn(value, key)) {
      throw new ActivitySaveMigrationError(`Save value at ${path}[${index}] must not be empty`);
    }
    const clonedValue = assertJsonProperty({ value, key, path: `${path}[${index}]`, ancestors, validate });
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: clonedValue,
      writable: true,
    });
  }
  return clone;
}

export function assertJsonArray(
  value: unknown[],
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => unknown,
): unknown[] {
  const length = getOwnArrayLength(value);
  if (length === undefined) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON array`);
  }
  assertJsonArrayKeys(value, path, length);
  return cloneJsonArrayItems({ value, path, length, ancestors, validate });
}
