import { isFeatureOpen } from './season';

export type HomeCardState = { status: 'before' | 'open' | 'after'; day?: number };
export interface HomeCardsContext {
  now: Date;
  adventAllowed: boolean;
  trackerAllowed: boolean;
}
export interface HomeCards {
  advent: HomeCardState;
  tracker: HomeCardState;
}

const DAY_MS = 86_400_000;

function adventDay(now: Date): number | undefined {
  const year = now.getUTCFullYear();
  const opening = Date.UTC(year, 11, 1, 12);
  const day = Math.floor((now.getTime() - opening) / DAY_MS) + 1;
  return day >= 1 && day <= 24 ? day : undefined;
}

function adventState(now: Date, allowed: boolean): HomeCardState {
  const year = now.getUTCFullYear();
  if (isFeatureOpen('advent', now)) {
    if (!allowed) return { status: 'open' };
    const day = adventDay(now);
    return day ? { status: 'open', day } : { status: 'after' };
  }
  const before = now.getUTCMonth() === 10 && now.getTime() < Date.UTC(year, 10, 30);
  if (before) return { status: 'before' };
  if (now.getUTCMonth() < 10) return { status: 'after' };
  return { status: 'open', ...(allowed ? { day: adventDay(now) } : {}) };
}

function trackerState(now: Date, allowed: boolean): HomeCardState {
  const year = now.getUTCFullYear();
  const takeoff = Date.UTC(year, 11, 24, 10);
  if (isFeatureOpen('tracker', now)) return { status: 'open' };
  const before =
    (now.getUTCMonth() === 10 || now.getUTCMonth() === 11) && now.getTime() < takeoff - 10 * 60_000;
  if (before) return { status: 'before' };
  if (now.getUTCMonth() < 11) return { status: 'after' };
  return { status: allowed ? 'open' : 'after' };
}

export function deriveHomeCards({
  now,
  adventAllowed,
  trackerAllowed,
}: HomeCardsContext): HomeCards {
  return {
    advent: adventState(now, adventAllowed),
    tracker: trackerState(now, trackerAllowed),
  };
}
