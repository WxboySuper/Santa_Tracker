export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isStringRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  return !isArrayValue(value);
}

export function isArrayValue(value: unknown): value is unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

export function getOwnDataPropertyDescriptor(
  value: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
}

export function getOwnArrayLength(value: object): number | undefined {
  const descriptor = getOwnDataPropertyDescriptor(value, 'length');
  if (descriptor === undefined || !('value' in descriptor)) return undefined;
  const length: unknown = descriptor.value;
  return typeof length === 'number'
    && Number.isInteger(length)
    && length >= 0
    && length <= 0xffff_ffff
    ? length
    : undefined;
}

export function isJsonArrayIndexKey(key: PropertyKey, length: number): boolean {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < length;
}

export function isAllowedJsonArrayKey(key: PropertyKey, length: number): boolean {
  return key === 'length' || isJsonArrayIndexKey(key, length);
}

export function isEnumerableDataProperty(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  if (descriptor === undefined) return false;
  if (!descriptor.enumerable) return false;
  return 'value' in descriptor;
}
