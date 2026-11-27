export class InvalidCandidateTimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCandidateTimezoneError';
  }
}

export function isInvalidCandidateTimezoneError(error: unknown): error is InvalidCandidateTimezoneError {
  return error instanceof InvalidCandidateTimezoneError;
}
