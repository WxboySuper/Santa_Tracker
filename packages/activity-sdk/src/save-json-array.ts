import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';
import { getOwnArrayLength, hasOwn } from './shared-guards';

function isJsonArrayIndexKey(key: PropertyKey, length: number): boolean {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < length;
}

function isAllowedJsonArrayKey(key: PropertyKey, length: number): boolean {
  return key === 'length' || isJsonArrayIndexKey(key, length);
}

function assertJsonArrayKeys(value: unknown[], path: string, length: number): void {
  let keys: PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON array`);
  }
  const hasExtraKey = keys.some((key) => !isAllowedJsonArrayKey(key, length));
  if (hasExtraKey) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain extra array keys`);
  }
}

export function assertJsonArray(
  value: unknown[],
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void,
): void {
  const length = getOwnArrayLength(value);
  if (length === undefined) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON array`);
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON array`);
  }
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!hasOwn(value, key)) {
      throw new ActivitySaveMigrationError(`Save value at ${path}[${index}] must not be empty`);
    }
    assertJsonProperty({ value, key, path: `${path}[${index}]`, ancestors, validate });
  }
  assertJsonArrayKeys(value, path, length);
}
