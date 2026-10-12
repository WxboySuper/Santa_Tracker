export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const errorWithCode = error as NodeJS.ErrnoException;
  if (errorWithCode.code === "ENOENT") return true;

  const cause = errorWithCode.cause;
  if (cause === "ENOENT") return true;
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") return true;
  return error.message.toLowerCase().includes("not found");
}
