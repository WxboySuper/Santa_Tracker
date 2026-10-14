export class ActivitySaveMigrationError extends Error {
  readonly name = 'ActivitySaveMigrationError';
}

export function getErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) {
      const message: unknown = error.message;
      return typeof message === 'string' ? message : String(message);
    }
    return String(error);
  } catch {
    try {
      return Object.prototype.toString.call(error);
    } catch {
      return '[unprintable error]';
    }
  }
}
