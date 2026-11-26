import { loadRouteNodesRaw } from "./lib/locations";
import { isWeatherRefreshOpen, refreshWeather } from "./lib/weather-refresh";
import { WeatherFallbackBudget } from "./lib/weather-budget";
import type { WeatherKV } from "./lib/weather";

interface CronEnv {
  WEATHER_CACHE: WeatherKV;
  WEATHER_ENABLED?: string;
  WEATHER_FALLBACK_BUDGET: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } };
}

export default {
  async fetch(request: Request, env: CronEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/budget" || request.method !== "POST") return new Response("Not found", { status: 404 });
    const limiter = env.WEATHER_FALLBACK_BUDGET.get(env.WEATHER_FALLBACK_BUDGET.idFromName("global"));
    return limiter.fetch("https://weather-budget/consume", { method: "POST" });
  },
  async scheduled(event: { scheduledTime: number }, env: CronEnv): Promise<void> {
    if (env.WEATHER_ENABLED === "false" || !isWeatherRefreshOpen(event.scheduledTime)) return;
    const route = await loadRouteNodesRaw();
    const limiter = env.WEATHER_FALLBACK_BUDGET.get(env.WEATHER_FALLBACK_BUDGET.idFromName("global"));
    const provider = async (input: RequestInfo | URL, init?: RequestInit) => {
      const permission = await limiter.fetch("https://weather-budget/consume", { method: "POST" });
      return permission.ok ? fetch(input, init) : new Response(null, { status: 429 });
    };
    const calls = await refreshWeather(event.scheduledTime, route, env.WEATHER_CACHE, provider);
    console.info(`Weather refresh completed with ${calls} provider batches`);
  },
};

export { WeatherFallbackBudget };
