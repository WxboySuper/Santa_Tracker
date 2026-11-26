/** A single global Durable Object keeps fallback requests below provider limits across colos. */
interface BudgetStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(values: Record<string, unknown>): Promise<void>;
  transaction<T>(callback: (storage: BudgetStorage) => Promise<T>): Promise<T>;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number): Promise<void>;
  list(options: { prefix: string }): Promise<Map<string, unknown>>;
  delete(keys: string[]): Promise<void>;
}
interface BudgetState { storage: BudgetStorage }
type BudgetRequest = { fallbackCell: string | null };
type BudgetClock = { now: number; minute: number; day: string };
type CleanupState = {
  minuteKeys: Map<string, unknown>;
  dayKeys: Map<string, unknown>;
  fallbackMinuteKeys: Map<string, unknown>;
  fallbackDayKeys: Map<string, unknown>;
  fallbackKeys: Map<string, unknown>;
  expired: string[];
  clock: BudgetClock;
};
const DAY_LIMIT = 900;
const MINUTE_LIMIT = 300;
const FALLBACK_DAY_LIMIT = 100;
const FALLBACK_MINUTE_LIMIT = 50;
const FALLBACK_COOLDOWN_MS = 15 * 60_000;

export class WeatherFallbackBudget {
  constructor(private readonly state: BudgetState) {}

  async fetch(request: Request): Promise<Response> {
    const parsed = parseBudgetRequest(request);
    if (parsed instanceof Response) return parsed;
    const clock = getBudgetClock();
    const allowed = await this.consumeBudget({ clock, fallbackCell: parsed.fallbackCell });
    await this.scheduleMinuteCleanup({ minute: clock.minute });
    return new Response(null, { status: allowed ? 204 : 429 });
  }

  private async consumeBudget(options: { clock: BudgetClock; fallbackCell: string | null }): Promise<boolean> {
    const { clock, fallbackCell } = options;
    return this.state.storage.transaction(async storage => {
      const dayKey = `day:${clock.day}`;
      const minuteKey = `minute:${clock.minute}`;
      const daily = await storage.get<number>(dayKey) ?? 0;
      const perMinute = await storage.get<number>(minuteKey) ?? 0;
      if (daily >= DAY_LIMIT || perMinute >= MINUTE_LIMIT) return false;
      const fallbackKey = fallbackCell ? `fallback:${fallbackCell}` : null;
      if (fallbackKey && await wasRecentlyUsed({ storage, key: fallbackKey, clock })) return false;
      const updates: Record<string, unknown> = { [dayKey]: daily + 1, [minuteKey]: perMinute + 1 };
      if (fallbackCell) {
        const counters = await readFallbackCounters({ storage, clock });
        if (isFallbackBudgetExceeded(counters)) return false;
        updates[counters.dayKey] = counters.day + 1;
        updates[counters.minuteKey] = counters.minute + 1;
        updates[fallbackKey!] = clock.now;
      }
      await storage.put(updates);
      return true;
    });
  }

  private async scheduleMinuteCleanup({ minute }: { minute: number }): Promise<void> {
    const existingAlarm = await this.state.storage.getAlarm();
    const cleanupAt = (minute + 2) * 60_000;
    if (existingAlarm === null) return this.state.storage.setAlarm(cleanupAt);
    if (existingAlarm <= Date.now()) return this.state.storage.setAlarm(cleanupAt);
    if (existingAlarm > cleanupAt) await this.state.storage.setAlarm(cleanupAt);
  }

  async alarm(): Promise<void> {
    const clock = getBudgetClock();
    const [minuteKeys, dayKeys, fallbackMinuteKeys, fallbackDayKeys, fallbackKeys] = await Promise.all([
      this.state.storage.list({ prefix: "minute:" }),
      this.state.storage.list({ prefix: "day:" }),
      this.state.storage.list({ prefix: "fallback-minute:" }),
      this.state.storage.list({ prefix: "fallback-day:" }),
      this.state.storage.list({ prefix: "fallback:" }),
    ]);
    const state: CleanupState = { minuteKeys, dayKeys, fallbackMinuteKeys, fallbackDayKeys, fallbackKeys, clock, expired: [] };
    state.expired = expiredMinuteKeys(state);
    state.expired.push(...expiredDayKeys(state), ...expiredFallbackKeys(state));
    if (state.expired.length) await this.state.storage.delete(state.expired);
    const nextAlarm = nextCleanupTime(state);
    if (nextAlarm !== null) await this.state.storage.setAlarm(nextAlarm);
  }
}

function parseBudgetRequest(request: Request): BudgetRequest | Response {
  const url = new URL(request.url);
  if (url.pathname !== "/consume") return new Response(null, { status: 404 });
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (url.searchParams.get("source") !== "fallback") return { fallbackCell: null };
  const fallbackCell = url.searchParams.get("cell");
  if (!fallbackCell) return new Response(null, { status: 400 });
  if (!/^cell:-?\d+\.\d{2}:-?\d+\.\d{2}$/.test(fallbackCell)) return new Response(null, { status: 400 });
  return { fallbackCell };
}

function getBudgetClock(): BudgetClock {
  const now = Date.now();
  return { now, minute: Math.floor(now / 60_000), day: new Date(now).toISOString().slice(0, 10) };
}

async function wasRecentlyUsed(options: { storage: BudgetStorage; key: string; clock: BudgetClock }): Promise<boolean> {
  const lastUse = await options.storage.get<number>(options.key);
  return lastUse !== undefined && options.clock.now - lastUse < FALLBACK_COOLDOWN_MS;
}

type FallbackCounters = { dayKey: string; minuteKey: string; day: number; minute: number };
async function readFallbackCounters(options: { storage: BudgetStorage; clock: BudgetClock }): Promise<FallbackCounters> {
  const dayKey = `fallback-day:${options.clock.day}`;
  const minuteKey = `fallback-minute:${options.clock.minute}`;
  return {
    dayKey,
    minuteKey,
    day: await options.storage.get<number>(dayKey) ?? 0,
    minute: await options.storage.get<number>(minuteKey) ?? 0,
  };
}

function isFallbackBudgetExceeded(counters: FallbackCounters): boolean {
  return counters.day >= FALLBACK_DAY_LIMIT || counters.minute >= FALLBACK_MINUTE_LIMIT;
}

function expiredMinuteKeys(state: CleanupState): string[] {
  const keys = [...state.minuteKeys.keys(), ...state.fallbackMinuteKeys.keys()];
  return keys.filter(key => {
    const prefix = key.startsWith("fallback-minute:") ? "fallback-minute:" : "minute:";
    return Number(key.slice(prefix.length)) < state.clock.minute - 1;
  });
}

function expiredDayKeys(state: CleanupState): string[] {
  const keys = [...state.dayKeys.keys(), ...state.fallbackDayKeys.keys()];
  return keys.filter(key => {
    const prefix = key.startsWith("fallback-day:") ? "fallback-day:" : "day:";
    return key.slice(prefix.length) < state.clock.day;
  });
}

function expiredFallbackKeys(state: CleanupState): string[] {
  return [...state.fallbackKeys].filter(([, value]) => isExpiredFallbackValue(value, state.clock.now)).map(([key]) => key);
}

function isExpiredFallbackValue(value: unknown, now: number): value is number {
  return typeof value === "number" && value <= now - FALLBACK_COOLDOWN_MS;
}

function nextCleanupTime(state: CleanupState): number | null {
  const minuteDeadlines = pendingMinuteDeadlines(state);
  const fallbackDeadlines = pendingFallbackDeadlines(state);
  const dayDeadlines = hasCurrentDayKey(state) ? [nextUtcDay(state.clock)] : [];
  const pending = [...minuteDeadlines, ...fallbackDeadlines, ...dayDeadlines]
    .filter(time => Number.isFinite(time) && time > state.clock.now);
  return pending.length ? Math.min(...pending) : null;
}

function pendingMinuteDeadlines(state: CleanupState): number[] {
  const keys = [...state.minuteKeys.keys(), ...state.fallbackMinuteKeys.keys()];
  return keys.filter(key => !state.expired.includes(key)).map(key => {
    const prefix = key.startsWith("fallback-minute:") ? "fallback-minute:" : "minute:";
    return (Number(key.slice(prefix.length)) + 2) * 60_000;
  });
}

function pendingFallbackDeadlines(state: CleanupState): number[] {
  return [...state.fallbackKeys].filter(([key, value]) => !state.expired.includes(key) && typeof value === "number")
    .map(([, value]) => (value as number) + FALLBACK_COOLDOWN_MS);
}

function hasCurrentDayKey(state: CleanupState): boolean {
  const currentDay = `day:${state.clock.day}`;
  const fallbackDay = `fallback-day:${state.clock.day}`;
  return (state.dayKeys.has(currentDay) || state.fallbackDayKeys.has(fallbackDay))
    && !state.expired.includes(currentDay) && !state.expired.includes(fallbackDay);
}

function nextUtcDay(clock: BudgetClock): number {
  return Date.parse(`${clock.day}T00:00:00.000Z`) + 24 * 60 * 60_000;
}
