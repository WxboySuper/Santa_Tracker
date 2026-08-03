/** Returns a stable browser-storage scope for one account or the local anonymous workspace. */
export const getStorageScope = (userId?: string | null): string =>
  userId ? `user-${encodeURIComponent(userId)}` : 'anonymous';

/** Adds an account scope to a storage key without exposing one account's data to another. */
export const getScopedStorageKey = (baseKey: string, scope = 'anonymous'): string =>
  `${baseKey}:${scope}`;
