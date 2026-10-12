import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';

export function assertJsonObject(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void,
): void {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
    }
    assertJsonProperty({ value, key, path: `${path}.${key}`, ancestors, validate });
  }
}
