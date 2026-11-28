export function candidateWithAdmin1Code<T extends { country?: string; admin1Code?: string | null }>(
  place: T,
  code?: string | null,
  preserveExisting?: boolean,
): T;
