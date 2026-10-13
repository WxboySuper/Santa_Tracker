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

function getJsonObjectPrototype(value: object, path: string): object | null {
  try {
    return Reflect.getPrototypeOf(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
}

function assertPlainJsonObject(prototype: object | null, path: string): void {
  if (prototype === null) return;
  if (!isPlainObjectPrototype(prototype)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  try {
    if (Reflect.getPrototypeOf(prototype) === null) return;
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
  throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
}

function getJsonObjectKeys(value: object, path: string): PropertyKey[] {
  try {
    return Reflect.ownKeys(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
}

function assertJsonObjectProperty(input: {
  value: object;
  key: PropertyKey;
  path: string;
  ancestors: WeakSet<object>;
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void;
}): void {
  const { value, key, path, ancestors, validate } = input;
  if (typeof key !== 'string') {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
  }
  assertJsonProperty({ value, key, path: `${path}[${JSON.stringify(key)}]`, ancestors, validate });
}

export function assertJsonObject(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => void,
): void {
  const prototype = getJsonObjectPrototype(value, path);
  assertPlainJsonObject(prototype, path);
  const keys = getJsonObjectKeys(value, path);
  for (const key of keys) {
    assertJsonObjectProperty({ value, key, path, ancestors, validate });
  }
}
