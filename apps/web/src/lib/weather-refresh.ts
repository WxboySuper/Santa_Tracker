import { fetchWeatherBatch, parseWeatherValue, WEATHER_TTL_SECONDS, weatherCellKey, type WeatherKV, type WeatherPoint } from "./weather";
import { isWeatherRefreshOpen } from "./weather-window";
import type { RouteNode } from "./locations";

export const WEATHER_REFRESH_CRON = "*/15 * * * *";
export const WEATHER_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;
export const WEATHER_BATCH_SIZE = 50;
export { isWeatherRefreshOpen } from "./weather-window";

export function weatherRoutePoints(route: RouteNode[], now: number): WeatherPoint[] {
  const scheduled = route.map((node, index) => ({
    node,
    index,
    at: Date.parse(node.schedule?.arrival_utc ?? node.schedule?.departure_utc ?? ""),
  })).filter(entry => Number.isFinite(entry.at));
  const current = scheduled.reduce<typeof scheduled[number] | undefined>((latest, entry) =>
    entry.at <= now && (!latest || entry.at > latest.at) ? entry : latest,
  undefined) ?? scheduled[0];
  const upcoming = scheduled.filter(entry => entry.at >= now && entry.at <= now + WEATHER_LOOKAHEAD_MS);
  const selected = [...(current ? [current] : []), ...upcoming].map(entry => entry.node.location)
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)
      && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180);
  return [...new Map(selected.map(point => {
    const normalized = { lat: point.lat, lon: point.lng };
    return [weatherCellKey(normalized), normalized] as const;
  })).values()];
}

export async function refreshWeather(
  now: number,
  route: RouteNode[],
  store: WeatherKV,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  if (!isWeatherRefreshOpen(now)) return 0;
  const points = weatherRoutePoints(route, now);
  const missing: WeatherPoint[] = [];
  for (const point of points) {
    try {
      if (!parseWeatherValue(await store.get(weatherCellKey(point)))) missing.push(point);
    } catch { missing.push(point); }
  }
  const results = await fetchWeatherBatch(missing, fetcher, WEATHER_BATCH_SIZE);
  let storedCells = 0;
  for (const [key, value] of results) {
    try {
      await store.put(key, JSON.stringify(value), { expirationTtl: WEATHER_TTL_SECONDS });
      storedCells += 1;
    } catch { /* Retry on the next cron tick. */ }
  }
  return storedCells;
}
