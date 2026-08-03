import { getStorageScope, getScopedStorageKey } from './storageScope';

export interface DayRolloverPromptState {
  previousDay: string;
  currentDay: string;
}

export const DAY_ROLLOVER_LAST_ACTIVE_KEY = 'gfc-last-active-local-day';
export const DAY_ROLLOVER_PROMPTED_KEY = 'gfc-day-rollover-prompt-day';
export const DAY_ROLLOVER_PENDING_KEY = 'gfc-day-rollover-pending';
export const DAY_ROLLOVER_CHECK_INTERVAL_MS = 60_000;

type StoredRolloverPrompt = DayRolloverPromptState;

/** Returns the localStorage key for rollover state in the current workspace scope. */
export function getRolloverStorageKey(key: string, userId?: string | null): string {
  return getScopedStorageKey(key, getStorageScope(userId));
}

/** Reads one stored day string from localStorage, returning null when storage is unavailable. */
export function readStoredDayValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Persists one day string into localStorage, ignoring storage errors. */
export function writeStoredDayValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures so the editor keeps functioning.
  }
}

/** Reads a pending rollover prompt, ignoring malformed or unavailable storage. */
export function readStoredRolloverPrompt(userId?: string | null): StoredRolloverPrompt | null {
  const stored = readStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<StoredRolloverPrompt>;
    return typeof parsed.previousDay === 'string' && typeof parsed.currentDay === 'string'
      ? { previousDay: parsed.previousDay, currentDay: parsed.currentDay }
      : null;
  } catch {
    return null;
  }
}

/** Persists a pending rollover prompt for the active workspace scope. */
export function writeStoredRolloverPrompt(prompt: StoredRolloverPrompt, userId?: string | null): void {
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId), JSON.stringify(prompt));
}

/** Removes a pending rollover prompt for the active workspace scope. */
export function clearStoredRolloverPrompt(userId?: string | null): void {
  try {
    localStorage.removeItem(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, userId));
  } catch {
    // Ignore storage failures.
  }
}
