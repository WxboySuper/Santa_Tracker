/**
 * Recursively clones plain JSON-like values used inside GeoJSON features.
 * Keep this explicit instead of using structuredClone so history snapshots
 * retain the existing plain-object and array semantics of this helper.
 *
 * @internal Shared by forecast history code and its opt-in performance test.
 */
export const cloneJsonValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const clonedObject: Record<string, unknown> = {};
    for (const key in objectValue) {
      if (Object.prototype.hasOwnProperty.call(objectValue, key)) {
        clonedObject[key] = cloneJsonValue(objectValue[key]);
      }
    }
    return clonedObject as T;
  }

  return value;
};
