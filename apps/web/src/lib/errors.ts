function readErrorProperty(error: unknown, property: "code" | "cause"): unknown {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return undefined;
  try {
    return Reflect.get(error, property);
  } catch {
    return undefined;
  }
}

export function isNotFoundError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current !== null && (typeof current === "object" || typeof current === "function")) {
    if (visited.has(current)) return false;
    visited.add(current);

    if (readErrorProperty(current, "code") === "ENOENT") return true;
    const cause = readErrorProperty(current, "cause");
    if (cause === "ENOENT") return true;
    current = cause;
  }
  return false;
}
