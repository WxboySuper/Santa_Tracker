import type { GradeAccountTier, GradeCard, GradeSnapshot } from '../../types/forecastGrade';

/**
 * Local persistence for Forecast Grade history (PR 05 — sources-history).
 *
 * Grade cards are the trend-only history kept for signed-in accounts (latest 25).
 * Snapshots are immutable full records stored for premium accounts to enable
 * restore. Runs never rewrite history — every completed run prepends a new card.
 * Signed-out sessions keep no history.
 */

export const GRADE_HISTORY_LIMIT = 25;

const CARDS_PREFIX = 'gfc-forecast-grade-cards-v1';
const SNAPSHOT_PREFIX = 'gfc-forecast-grade-snapshot-v1';

/** Stable per-account storage scope. Signed-out sessions are not persisted. */
export const accountScope = (tier: GradeAccountTier, userId?: string): string | null => {
  if (tier === 'signed-out') {
    return null;
  }
  return userId ? `user:${userId}` : `local:${tier}`;
};

const cardsKey = (scope: string): string => `${CARDS_PREFIX}:${scope}`;
const snapshotKey = (scope: string, cardId: string): string =>
  `${SNAPSHOT_PREFIX}:${scope}:${cardId}`;

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Reads the trend-only grade cards for a scope, newest first. */
export const loadGradeCards = (scope: string | null): GradeCard[] => {
  if (!scope) {
    return [];
  }
  const storage = safeStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(cardsKey(scope));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GradeCard[]) : [];
  } catch {
    return [];
  }
};

/** Persists a card list (trimmed to the limit) for a scope. */
const persistCards = (scope: string, cards: GradeCard[]): void => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(cardsKey(scope), JSON.stringify(cards.slice(0, GRADE_HISTORY_LIMIT)));
  } catch {
    // Ignore quota / serialization failures; history is best-effort.
  }
};

export interface RecordGradeOptions {
  scope: string | null;
  card: GradeCard;
  /** Immutable snapshot stored only for premium accounts. */
  snapshot?: GradeSnapshot;
}

/**
 * Records a completed run: prepends the card and trims to the limit. When a
 * snapshot is supplied (premium), it is written under the card id for restore.
 * Cards evicted past the limit have their snapshots removed to bound storage.
 */
export const recordGradeResult = ({ scope, card, snapshot }: RecordGradeOptions): GradeCard[] => {
  if (!scope) {
    return [];
  }
  const existing = loadGradeCards(scope);
  const next = [card, ...existing];
  const trimmed = next.slice(0, GRADE_HISTORY_LIMIT);

  const storage = safeStorage();
  if (storage && snapshot) {
    try {
      storage.setItem(snapshotKey(scope, card.id), JSON.stringify(snapshot));
    } catch {
      // Snapshot persistence is best-effort.
    }
  }

  if (storage) {
    for (const evicted of next.slice(GRADE_HISTORY_LIMIT)) {
      try {
        storage.removeItem(snapshotKey(scope, evicted.id));
      } catch {
        // Ignore.
      }
    }
  }

  persistCards(scope, trimmed);
  return trimmed;
};

/** Loads the immutable full snapshot for a card, if one was stored (premium). */
export const loadGradeSnapshot = (scope: string | null, cardId: string): GradeSnapshot | null => {
  if (!scope) {
    return null;
  }
  const storage = safeStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(snapshotKey(scope, cardId));
    return raw ? (JSON.parse(raw) as GradeSnapshot) : null;
  } catch {
    return null;
  }
};

/** Clears all grade history for a scope (cards and snapshots). */
export const clearGradeHistory = (scope: string | null): void => {
  if (!scope) {
    return;
  }
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  const cards = loadGradeCards(scope);
  try {
    storage.removeItem(cardsKey(scope));
    for (const card of cards) {
      storage.removeItem(snapshotKey(scope, card.id));
    }
  } catch {
    // Ignore.
  }
};
