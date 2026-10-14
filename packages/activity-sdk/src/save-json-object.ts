import { ActivitySaveMigrationError } from './save-errors';
import { assertJsonProperty } from './save-json-property';
import { getOwnDataPropertyDescriptor } from './shared-guards';

function getJsonObjectPrototype(value: object, path: string): object | null {
  try {
    return Reflect.getPrototypeOf(value);
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be an inspectable JSON object`);
  }
}

function assertPlainJsonObject(prototype: object | null, path: string): void {
  if (prototype === null) return;
  try {
    if (Reflect.getPrototypeOf(prototype) === null) {
      const constructor: unknown = getOwnDataPropertyDescriptor(prototype, 'constructor')?.value;
      if (
        typeof constructor === 'function'
        && Reflect.get(constructor, 'prototype') === prototype
        && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object)
      ) {
        return;
      }
    }
  } catch {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
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

function cloneJsonObjectProperty(input: {
  value: object;
  key: PropertyKey;
  path: string;
  ancestors: WeakSet<object>;
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => unknown;
}): { key: string; value: unknown } {
  const { value, key, path, ancestors, validate } = input;
  if (typeof key !== 'string') {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
  }
  return {
    key,
    value: assertJsonProperty({ value, key, path: `${path}[${JSON.stringify(key)}]`, ancestors, validate }),
  };
}

export function assertJsonObject(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
  validate: (value: unknown, path: string, ancestors: WeakSet<object>) => unknown,
): Record<string, unknown> {
  const prototype = getJsonObjectPrototype(value, path);
  assertPlainJsonObject(prototype, path);
  const keys = getJsonObjectKeys(value, path);
  const clone: Record<string, unknown> = {};
  for (const key of keys) {
    const property = cloneJsonObjectProperty({ value, key, path, ancestors, validate });
    Object.defineProperty(clone, property.key, {
      configurable: true,
      enumerable: true,
      value: property.value,
      writable: true,
    });
  }
  return clone;
}
