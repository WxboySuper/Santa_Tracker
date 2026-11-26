import { fetchWeatherBatch, parseWeatherValue, WEATHER_TTL_SECONDS, weatherCellKey, type WeatherKV, type WeatherPoint } from "./weather";
import { isWeatherRefreshOpen } from "./weather-window";
import type { RouteNode } from "./locations";

export const WEATHER_REFRESH_CRON = "*/15 * * * *";
export const WEATHER_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;
export const WEATHER_BATCH_SIZE = 50;
export { isWeatherRefreshOpen } from "./weather-window";

type ScheduledRouteStop = { node: RouteNode; at: number };
type RouteCoordinate = { lat: number; lng: number };

export function weatherRoutePoints(route: RouteNode[], now: number): WeatherPoint[] {
  const scheduled = getScheduledRouteStops(route);
  const current = findCurrentRouteStop(scheduled, now);
  const selected = [...(current ? [current] : []), ...getUpcomingRouteStops(scheduled, now)];
  return uniqueValidRoutePoints(selected.map(entry => entry.node.location));
}

function getScheduledRouteStops(route: RouteNode[]): ScheduledRouteStop[] {
  return route.map(node => ({
    node,
    at: Date.parse(node.schedule?.arrival_utc ?? node.schedule?.departure_utc ?? ""),
  })).filter(entry => Number.isFinite(entry.at));
}

function findCurrentRouteStop(scheduled: ScheduledRouteStop[], now: number): ScheduledRouteStop | undefined {
  return scheduled.reduce<ScheduledRouteStop | undefined>((latest, entry) =>
    entry.at <= now && (!latest || entry.at > latest.at) ? entry : latest,
  undefined) ?? scheduled[0];
}

function getUpcomingRouteStops(scheduled: ScheduledRouteStop[], now: number): ScheduledRouteStop[] {
  return scheduled.filter(entry => entry.at >= now && entry.at <= now + WEATHER_LOOKAHEAD_MS);
}

function uniqueValidRoutePoints(selected: RouteCoordinate[]): WeatherPoint[] {
  const valid = selected.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180);
  return [...new Map(valid.map(point => {
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
