import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';

function isPlainObjectPrototype(value: object): boolean {
  try {
    const constructor: unknown = Object.getOwnPropertyDescriptor(value, 'constructor')?.value;
    if (typeof constructor !== 'function') return false;
    return Object.getOwnPropertyDescriptor(constructor, 'prototype')?.value === value;
  } catch {
    return false;
  }
}

export function assertJsonObject(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void,
): void {
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Reflect.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
  let prototypeParent: object | null = null;
  try {
    if (prototype !== null) prototypeParent = Reflect.getPrototypeOf(prototype);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
  if (prototype !== null && (prototypeParent !== null || !isPlainObjectPrototype(prototype))) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
    }
    assertJsonProperty({ value, key, path: `${path}[${JSON.stringify(key)}]`, ancestors, validate });
  }
}
