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
    let transactionQueue = Promise.resolve();
    const storage: TestStorage = {
      get: async (key: string) => values.get(key),
      put: async (entries: Record<string, unknown>) => { for (const [key, value] of Object.entries(entries)) values.set(key, value); },
      transaction: <T>(callback: (store: TestStorage) => Promise<T>) => {
        const result = transactionQueue.then(() => callback(storage));
        transactionQueue = result.then(() => undefined, () => undefined);
        return result;
      },
      getAlarm: async () => null,
      setAlarm: async () => undefined,
      list: async ({ prefix }: { prefix: string }) => new Map([...values].filter(([key]) => key.startsWith(prefix))),
      delete: async (keys: string[]) => { for (const key of keys) values.delete(key); },
    };
    const budget = new WeatherFallbackBudget({ storage } as never);
    const responses = await Promise.all(Array.from({ length: 901 }, () => budget.fetch()));
    expect(responses.filter(response => response.status === 204)).toHaveLength(900);
    expect(responses.at(-1)?.status).toBe(429);
    vi.restoreAllMocks();
  });
});
