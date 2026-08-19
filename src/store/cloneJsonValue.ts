/**
 * Recursively clones plain JSON-like values used inside GeoJSON features.
 * Keep this explicit instead of using structuredClone so history snapshots
 * retain the existing plain-object and array semantics of this helper.
 *
 * @internal Shared by forecast history code and its opt-in performance test.
 */
export const cloneJsonValue = <T>(value: T, preserveDangerousKeys = false): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item, preserveDangerousKeys)) as T;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const clonedObject: Record<string, unknown> = {};
    Object.keys(objectValue).forEach((key) => {
      const clonedValue = cloneJsonValue(objectValue[key], preserveDangerousKeys);
      if (preserveDangerousKeys || key === '__proto__') {
        Object.defineProperty(clonedObject, key, {
          configurable: true,
          enumerable: true,
          value: clonedValue,
          writable: true,
        });
      } else {
        clonedObject[key] = clonedValue;
      }
    });
    return clonedObject as T;
  }

  return value;
};
