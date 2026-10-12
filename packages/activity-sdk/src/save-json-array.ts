import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isJsonArrayIndexKey(key: PropertyKey, length: number): boolean {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < length;
}

function isAllowedJsonArrayKey(key: PropertyKey, length: number): boolean {
  return key === 'length' || isJsonArrayIndexKey(key, length);
}

function assertJsonArrayKeys(value: unknown[], path: string): void {
  const hasExtraKey = Reflect.ownKeys(value).some((key) => !isAllowedJsonArrayKey(key, value.length));
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
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!hasOwn(value, key)) {
      throw new ActivitySaveMigrationError(`Save value at ${path}[${index}] must not be empty`);
    }
    assertJsonProperty({ value, key, path: `${path}[${index}]`, ancestors, validate });
  }
  assertJsonArrayKeys(value, path);
}
