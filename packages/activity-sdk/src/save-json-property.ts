import { ActivitySaveMigrationError } from './save-errors';
import { getOwnDataPropertyDescriptor, isEnumerableDataProperty } from './shared-guards';

export function assertJsonProperty(input: {
  value: object;
  key: string;
  path: string;
  ancestors: WeakSet<object>;
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => unknown;
}): unknown {
  const { value, key, path, ancestors, validate } = input;
  const descriptor = getOwnDataPropertyDescriptor(value, key);
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  return validate(descriptor.value, path, ancestors);
}
