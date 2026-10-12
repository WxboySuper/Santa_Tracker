import { ActivitySaveMigrationError, getErrorMessage } from './save-errors';

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertFiniteJsonNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a finite JSON number`);
  }
}

function assertJsonPrimitive(value: unknown, path: string): boolean {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      assertFiniteJsonNumber(value, path);
      return true;
    case 'object':
      return value === null;
    default:
      throw new ActivitySaveMigrationError(`Save value at ${path} must be JSON-compatible`);
  }
}

function assertJsonProperty({
  value,
  key,
  path,
  ancestors,
}: {
  value: object;
  key: string;
  path: string;
  ancestors: WeakSet<object>;
}): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  if (!descriptor.enumerable) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  if (!('value' in descriptor)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a JSON value`);
  }
  assertJsonCompatible(descriptor.value, path, ancestors);
}

function assertJsonArrayEntries(
  value: unknown[],
  path: string,
  ancestors: WeakSet<object>,
): void {
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!hasOwn(value, key)) {
      throw new ActivitySaveMigrationError(`Save value at ${path}[${index}] must not be empty`);
    }
    assertJsonProperty({ value, key, path: `${path}[${index}]`, ancestors });
  }
}

function isJsonArrayIndexKey(key: PropertyKey, length: number): boolean {
  return typeof key === 'string'
    && /^(0|[1-9]\d*)$/.test(key)
    && Number(key) < length;
}

function isAllowedJsonArrayKey(key: PropertyKey, length: number): boolean {
  return key === 'length' || isJsonArrayIndexKey(key, length);
}

function assertJsonArrayKeys(value: unknown[], path: string): void {
  const hasExtraKey = Reflect.ownKeys(value).some(
    (key) => !isAllowedJsonArrayKey(key, value.length),
  );
  if (hasExtraKey) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain extra array keys`);
  }
}

function assertJsonObjectProperties(
  value: object,
  path: string,
  ancestors: WeakSet<object>,
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new ActivitySaveMigrationError(`Save value at ${path} must not contain symbol keys`);
    }
    assertJsonProperty({ value, key, path: `${path}.${key}`, ancestors });
  }
}

function assertJsonObject(value: object, path: string, ancestors: WeakSet<object>): void {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON object`);
  }
  assertJsonObjectProperties(value, path, ancestors);
}

export function assertJsonCompatible(
  value: unknown,
  path = '$',
  ancestors = new WeakSet(),
): void {
  if (assertJsonPrimitive(value, path)) return;

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new ActivitySaveMigrationError(`Save value at ${path} must not contain cycles`);
  }

  ancestors.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      if (Object.getPrototypeOf(objectValue) !== Array.prototype) {
        throw new ActivitySaveMigrationError(`Save value at ${path} must be a plain JSON array`);
      }
      assertJsonArrayEntries(objectValue, path, ancestors);
      assertJsonArrayKeys(objectValue, path);
      return;
    }
    assertJsonObject(objectValue, path, ancestors);
  } finally {
    ancestors.delete(objectValue);
  }
}

export function clonePayload(payload: unknown): unknown {
  try {
    assertJsonCompatible(payload);
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new Error('Value has no JSON representation');
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof ActivitySaveMigrationError) throw error;
    throw new ActivitySaveMigrationError(
      `Cannot migrate activity save: payload is not JSON-compatible (${getErrorMessage(error)})`,
    );
  }
}
