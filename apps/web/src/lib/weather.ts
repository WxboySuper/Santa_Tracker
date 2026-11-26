import { NextResponse } from "next/server";
import { isWeatherRefreshOpen } from "./weather-window";

export const WEATHER_GRID = 0.25;
export const WEATHER_TTL_SECONDS = 30 * 60;
const TIMEOUT_MS = 4500;
const labels: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail" };
export type WeatherResult = { temperatureC: number; temperatureF: number; code: number; label: string };
export type WeatherPoint = { lat: number; lon: number };
type WeatherFetch = (url: string, init: RequestInit) => Promise<Response>;
export interface WeatherKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
export interface FallbackBudget {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

function rounded(point: WeatherPoint): WeatherPoint {
  return { lat: Math.round(point.lat / WEATHER_GRID) * WEATHER_GRID, lon: Math.round(point.lon / WEATHER_GRID) * WEATHER_GRID };
}
export function weatherCellKey(point: WeatherPoint): string {
  const cell = rounded(point);
  return `cell:${cell.lat.toFixed(2)}:${cell.lon.toFixed(2)}`;
}
const PUBLIC_WEATHER_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=720" };
function nullWeather(status = 200): Response {
  return NextResponse.json(null, { status, headers: { "Cache-Control": "no-store" } });
}
function displayWeather(temperatureC: number, code: number): WeatherResult {
  return { temperatureC, temperatureF: Math.round((temperatureC * 9 / 5 + 32) * 10) / 10, code, label: labels[code] ?? "Weather" };
}
function validCurrent(value: unknown): value is { temperature_2m: number; weather_code: number } {
  if (!value || typeof value !== "object") return false;
  const current = value as Record<string, unknown>;
  return typeof current.temperature_2m === "number" && Number.isFinite(current.temperature_2m) && typeof current.weather_code === "number" && Number.isInteger(current.weather_code);
}
function providerUrl(points: WeatherPoint[]): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: points.map(point => String(point.lat)).join(","),
    longitude: points.map(point => String(point.lon)).join(","),
    current: "temperature_2m,weather_code", temperature_unit: "celsius", forecast_days: "1",
  }).toString();
  return url.toString();
}
async function fetchJson(url: string, fetcher: WeatherFetch): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    return response.ok ? await response.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
export async function fetchWeather(lat: number, lon: number, fetcher: WeatherFetch = fetch): Promise<WeatherResult | null> {
  const body = await fetchJson(providerUrl([rounded({ lat, lon })]), fetcher);
  const current = body && typeof body === "object" ? (body as { current?: unknown }).current : null;
  return validCurrent(current) ? displayWeather(current.temperature_2m, current.weather_code) : null;
}

/** Fetches unique grid cells in bounded multi-coordinate provider calls. */
export async function fetchWeatherBatch(
  points: WeatherPoint[], fetcher: WeatherFetch = fetch, batchSize = 50,
): Promise<Map<string, WeatherResult>> {
  const unique = [...new Map(points.map(point => {
    const cell = rounded(point);
    return [weatherCellKey(cell), cell] as const;
  })).entries()];
  const results = new Map<string, WeatherResult>();
  for (let start = 0; start < unique.length; start += batchSize) {
    const batch = unique.slice(start, start + batchSize);
    const body = await fetchJson(providerUrl(batch.map(([, point]) => point)), fetcher);
    const rows = Array.isArray(body) ? body : [body];
    if (rows.length !== batch.length) {
      throw new Error(`Open-Meteo returned ${rows.length} rows for a ${batch.length}-cell batch`);
    }
    const requestedKeys = new Set(batch.map(([key]) => key));
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const coordinates = row as { latitude?: unknown; longitude?: unknown; current?: unknown };
      if (typeof coordinates.latitude !== "number" || typeof coordinates.longitude !== "number") continue;
      const key = weatherCellKey({ lat: coordinates.latitude, lon: coordinates.longitude });
      if (requestedKeys.has(key) && validCurrent(coordinates.current)) {
        results.set(key, displayWeather(coordinates.current.temperature_2m, coordinates.current.weather_code));
      }
    }
  }
  return results;
}
function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function getBindings(): { weather: WeatherKV | null; budget: FallbackBudget | null } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("cloudflare:workers") as { env: {
      WEATHER_CACHE?: WeatherKV;
      WEATHER_FALLBACK_BUDGET?: { idFromName(name: string): unknown; get(id: unknown): FallbackBudget };
    } };
    const namespace = env.WEATHER_FALLBACK_BUDGET;
    return { weather: env.WEATHER_CACHE ?? null, budget: namespace?.get(namespace.idFromName("global")) ?? null };
  } catch { return { weather: null, budget: null }; }
}

function getWeatherPoint(request: Request): WeatherPoint | null {
  const params = new URL(request.url).searchParams;
  const lat = parseCoordinate(params.get("lat"), -90, 90);
  const lon = parseCoordinate(params.get("lon"), -180, 180);
  return lat === null || lon === null ? null : rounded({ lat, lon });
}

function resolveWeatherBindings(options: { store?: WeatherKV | null; budget?: FallbackBudget | null }) {
  const bindings = getBindings();
  return {
    store: options.store === undefined ? bindings.weather : options.store,
    budget: options.budget === undefined ? bindings.budget : options.budget,
  };
}

function weatherIsDisabled(enabled?: boolean): boolean {
  return enabled === false || process.env.WEATHER_ENABLED === "false";
}

export async function getWeatherResponse(
  request: Request,
  options: { enabled?: boolean; store?: WeatherKV | null; budget?: FallbackBudget | null; fetcher?: WeatherFetch; now?: number } = {},
): Promise<Response> {
  if (weatherIsDisabled(options.enabled)) return nullWeather();
  const point = getWeatherPoint(request);
  if (!point) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  const { store, budget } = resolveWeatherBindings(options);
  const key = weatherCellKey(point);
  const cached = await readWeatherFromStore(store, key);
  if (cached) return cached;
  if (!isWeatherRefreshOpen(options.now ?? Date.now())) return nullWeather();
  return fetchWeatherFallback({ budget, store, key, point, fetcher: options.fetcher });
}

function isWeatherResult(value: unknown): value is WeatherResult {
  if (!value || typeof value !== "object") return false;
  const weather = value as Record<string, unknown>;
  return typeof weather.temperatureC === "number" && Number.isFinite(weather.temperatureC)
    && typeof weather.temperatureF === "number" && Number.isFinite(weather.temperatureF)
    && typeof weather.code === "number" && Number.isInteger(weather.code)
    && typeof weather.label === "string";
}

async function readWeatherFromStore(store: WeatherKV | null, key: string): Promise<Response | null> {
  if (!store) return null;
  try {
    const value = await store.get(key);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return isWeatherResult(parsed) ? NextResponse.json(parsed, { headers: PUBLIC_WEATHER_HEADERS }) : null;
  } catch { return null; }
}

interface WeatherFallbackOptions {
  budget: FallbackBudget | null;
  store: WeatherKV | null;
  key: string;
  point: WeatherPoint;
  fetcher?: WeatherFetch;
}

async function cacheWeatherResult(store: WeatherKV | null, key: string, weather: WeatherResult): Promise<void> {
  try { await store?.put(key, JSON.stringify(weather), { expirationTtl: WEATHER_TTL_SECONDS }); } catch { /* Keep the response even if KV is down. */ }
}

async function fetchWeatherFallback({ budget, store, key, point, fetcher }: WeatherFallbackOptions): Promise<Response> {
  if (!budget) return nullWeather();
  try {
    const permission = await budget.fetch("https://weather-budget/consume", { method: "POST" });
    if (!permission.ok) return nullWeather();
    const weather = await fetchWeather(point.lat, point.lon, fetcher);
    if (!weather) return nullWeather(502);
    await cacheWeatherResult(store, key, weather);
    return NextResponse.json(weather, { headers: PUBLIC_WEATHER_HEADERS });
  } catch { return nullWeather(); }
}
