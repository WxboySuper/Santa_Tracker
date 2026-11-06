import { isFeatureOpen } from './season';

export type HomeCardState = {
  status: 'before' | 'open' | 'after';
  day?: number;
  phase?: 'before-doors' | 'after-doors' | 'hidden';
};
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

function firstDoorPhase(now: Date): 'before-doors' | 'after-doors' {
  const month = now.getUTCMonth();
  const beforeFirstDoor = month === 10 ||
    (month === 11 && now.getUTCDate() === 1 && now.getUTCHours() < 12);
  return beforeFirstDoor ? 'before-doors' : 'after-doors';
}

function openAdventState(now: Date, allowed: boolean): HomeCardState {
  if (!allowed) return { status: 'open', phase: 'hidden' };
  const day = adventDay(now);
  if (day) return { status: 'open', day };
  return { status: 'open', phase: firstDoorPhase(now) };
}

function beforeAdventWindow(now: Date): boolean {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return (month === 9 || month === 10) && now.getTime() < Date.UTC(year, 10, 30);
}

function adventState(now: Date, allowed: boolean): HomeCardState {
  if (isFeatureOpen('advent', now)) return openAdventState(now, allowed);
  if (beforeAdventWindow(now)) return { status: 'before' };
  return { status: 'after' };
}

function trackerState(now: Date, allowed: boolean): HomeCardState {
  const year = now.getUTCFullYear();
  const takeoff = Date.UTC(year, 11, 24, 10);
  if (isFeatureOpen('tracker', now)) return { status: 'open' };
  const month = now.getUTCMonth();
  const before =
    (month === 9 || month === 10 || month === 11) && now.getTime() < takeoff - 10 * 60_000;
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
