import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const GRID = 0.25;
const CACHE_SECONDS = 720;
const TIMEOUT_MS = 4500;
const labels: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail" };
type WeatherFetch = (url: string, init: RequestInit) => Promise<Response>;
type WeatherResult = { temperatureC: number; temperatureF: number; code: number; label: string };
function displayWeather(temperatureC: number, code: number): WeatherResult {
  return { temperatureC, temperatureF: Math.round((temperatureC * 9 / 5 + 32) * 10) / 10, code, label: labels[code] ?? "Weather" };
}
function validWeather(data: { current?: { temperature_2m?: unknown; weather_code?: unknown } }): data is { current: { temperature_2m: number; weather_code: number } } {
  return typeof data.current?.temperature_2m === "number" && Number.isFinite(data.current.temperature_2m) && typeof data.current.weather_code === "number" && Number.isInteger(data.current.weather_code);
}
export async function fetchWeather(lat: number, lon: number, fetcher: WeatherFetch = fetch): Promise<{ temperatureC: number; temperatureF: number; code: number; label: string } | null> {
  const roundedLat = Math.round(lat / GRID) * GRID;
  const roundedLon = Math.round(lon / GRID) * GRID;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(roundedLat), longitude: String(roundedLon), current: "temperature_2m,weather_code", temperature_unit: "celsius", forecast_days: "1" }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url.toString(), { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json() as { current?: { temperature_2m?: unknown; weather_code?: unknown } };
    if (!validWeather(data)) return null;
    return displayWeather(data.current.temperature_2m, data.current.weather_code);
  } catch { return null; } finally { clearTimeout(timer); }
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const lat = latRaw === null || latRaw.trim() === "" ? NaN : Number(latRaw);
  const lon = lonRaw === null || lonRaw.trim() === "" ? NaN : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  const roundedLat = Math.round(lat / GRID) * GRID;
  const roundedLon = Math.round(lon / GRID) * GRID;
  const cacheKey = new URL(request.url);
  cacheKey.search = new URLSearchParams({ lat: String(roundedLat), lon: String(roundedLon) }).toString();
  const cache = (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches?.default;
  const keyRequest = new Request(cacheKey.toString());
  if (cache) { const cached = await cache.match(keyRequest); if (cached) return cached; }
  const weather = await fetchWeather(roundedLat, roundedLon);
  if (!weather) return NextResponse.json(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  const response = NextResponse.json(weather, { status: 200, headers: { "Cache-Control": `public, max-age=0, s-maxage=${CACHE_SECONDS}`, "CDN-Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
  if (cache && weather) await cache.put(keyRequest, response.clone());
  return response;
}
