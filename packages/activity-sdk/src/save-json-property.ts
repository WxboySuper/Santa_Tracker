import { ActivitySaveMigrationError } from './save-errors';

export function assertJsonProperty(input: {
  value: object;
  key: string;
  path: string;
  ancestors: WeakSet<object>;
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void;
}): void {
  const { value, key, path, ancestors, validate } = input;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  validate(descriptor.value, path, ancestors);
}
