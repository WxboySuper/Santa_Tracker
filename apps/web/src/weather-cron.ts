import { loadRouteNodesRaw } from "./lib/locations";
import { isWeatherRefreshOpen, refreshWeather } from "./lib/weather-refresh";
import { WeatherFallbackBudget } from "./lib/weather-budget";
import type { WeatherKV } from "./lib/weather";
import type { R2BucketLike } from "./lib/storage/r2-backend";

interface CronEnv {
  WEATHER_CACHE: WeatherKV;
  SANTA_SNAPSHOTS: R2BucketLike;
  WEATHER_ENABLED?: string;
  WEATHER_FALLBACK_BUDGET: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } };
}

export default {
  async scheduled(event: { scheduledTime: number }, env: CronEnv): Promise<void> {
    if (env.WEATHER_ENABLED === "false" || !isWeatherRefreshOpen(event.scheduledTime)) return;
    try {
      const route = await loadRouteNodesRaw(undefined, env.SANTA_SNAPSHOTS);
      const limiter = env.WEATHER_FALLBACK_BUDGET.get(env.WEATHER_FALLBACK_BUDGET.idFromName("global"));
      let providerCalls = 0;
      const provider = async (input: RequestInfo | URL, init?: RequestInit) => {
        const permission = await limiter.fetch("https://weather-budget/consume", { method: "POST" });
        if (!permission.ok) return new Response(null, { status: 429 });
        providerCalls += 1;
        return fetch(input, init);
      };
      const storedCells = await refreshWeather(event.scheduledTime, route, env.WEATHER_CACHE, provider);
      console.info(`Weather refresh attempted ${providerCalls} provider calls and stored ${storedCells} cells`);
    } catch (error) {
      console.error("Weather cron refresh failed", error);
    }
  },
};

export { WeatherFallbackBudget };
