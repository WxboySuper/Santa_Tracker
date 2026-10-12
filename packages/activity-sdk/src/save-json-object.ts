import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';

export function assertJsonObject(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void,
): void {
  let prototype: unknown;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
    }
    assertJsonProperty({ value, key, path: `${path}.${key}`, ancestors, validate });
  }
}
