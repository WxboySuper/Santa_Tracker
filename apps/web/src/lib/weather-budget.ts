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

export class WeatherFallbackBudget {
  constructor(private readonly state: BudgetState) {}

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/consume") return new Response(null, { status: 404 });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const minute = Math.floor(now / 60_000);
    const allowed = await this.state.storage.transaction(async storage => {
      const dayKey = `day:${day}`;
      const minuteKey = `minute:${minute}`;
      const daily = await storage.get<number>(dayKey) ?? 0;
      const perMinute = await storage.get<number>(minuteKey) ?? 0;
      if (daily >= 900 || perMinute >= 300) return false;
      await storage.put({ [dayKey]: daily + 1, [minuteKey]: perMinute + 1 });
      return true;
    });
    if (!allowed) return new Response(null, { status: 429 });
    const existingAlarm = await this.state.storage.getAlarm();
    const cleanupAt = (minute + 2) * 60_000;
    if (existingAlarm === null || existingAlarm > cleanupAt) await this.state.storage.setAlarm(cleanupAt);
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const keys = await this.state.storage.list({ prefix: "minute:" });
    const expired = [...keys.keys()].filter(key => Number(key.slice("minute:".length)) < minute - 1);
    const daily = await this.state.storage.list({ prefix: "day:" });
    for (const key of daily.keys()) {
      if (key.slice("day:".length) < new Date(now).toISOString().slice(0, 10)) expired.push(key);
    }
    if (expired.length) await this.state.storage.delete(expired);
  }
}
