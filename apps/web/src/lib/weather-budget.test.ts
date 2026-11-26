import { describe, expect, it, vi } from "vitest";
import { WeatherFallbackBudget } from "./weather-budget";

describe("global weather provider budget", () => {
  it("allows at most 900 provider requests per UTC day", async () => {
    let request = 0;
    const start = Date.UTC(2026, 11, 24, 10);
    vi.spyOn(Date, "now").mockImplementation(() => start + Math.floor(request++ / 300) * 60_000);
    const values = new Map<string, unknown>();
    type TestStorage = {
      get(key: string): Promise<unknown>;
      put(entries: Record<string, unknown>): Promise<void>;
      transaction<T>(callback: (store: TestStorage) => Promise<T>): Promise<T>;
      getAlarm(): Promise<number | null>;
      setAlarm(timestamp: number): Promise<void>;
      list(options: { prefix: string }): Promise<Map<string, unknown>>;
      delete(keys: string[]): Promise<void>;
    };
    let transactions = 0;
    let alarmAt: number | null = null;
    let transactionQueue = Promise.resolve();
    const storage: TestStorage = {
      get: async (key: string) => values.get(key),
      put: async (entries: Record<string, unknown>) => { for (const [key, value] of Object.entries(entries)) values.set(key, value); },
      transaction: <T>(callback: (store: TestStorage) => Promise<T>) => {
        transactions += 1;
        const result = transactionQueue.then(() => callback(storage));
        transactionQueue = result.then(() => undefined, () => undefined);
        return result;
      },
      getAlarm: async () => alarmAt,
      setAlarm: async (timestamp: number) => { alarmAt = timestamp; },
      list: async ({ prefix }: { prefix: string }) => new Map([...values].filter(([key]) => key.startsWith(prefix))),
      delete: async (keys: string[]) => { for (const key of keys) values.delete(key); },
    };
    const budget = new WeatherFallbackBudget({ storage } as never);
    expect((await budget.fetch(new Request("https://weather-budget/consume", { method: "GET" }))).status).toBe(405);
    expect((await budget.fetch(new Request("https://weather-budget/other", { method: "POST" }))).status).toBe(404);
    const fallback = new Request("https://weather-budget/consume?source=fallback&cell=cell:0.00:0.00", { method: "POST" });
    expect((await budget.fetch(fallback)).status).toBe(204);
    expect((await budget.fetch(fallback)).status).toBe(429);
    const consume = new Request("https://weather-budget/consume", { method: "POST" });
    const responses = await Promise.all(Array.from({ length: 901 }, () => budget.fetch(consume)));
    expect(responses.filter(response => response.status === 204)).toHaveLength(899);
    expect(responses.at(-1)?.status).toBe(429);
    expect(transactions).toBe(903);
    await budget.alarm();
    expect(alarmAt).toBe((Math.floor(start / 60_000) + 4) * 60_000);
    vi.restoreAllMocks();
  });
});
