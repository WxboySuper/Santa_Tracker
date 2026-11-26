import { NextResponse } from "next/server";
import { isWeatherRefreshOpen } from "./weather-window";

export const WEATHER_GRID = 0.25;
export const WEATHER_TTL_SECONDS = 30 * 60;
const TIMEOUT_MS = 4500;
const labels: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Heavy showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail" };
export type WeatherResult = { temperatureC: number; temperatureF: number; code: number; label: string };
export type WeatherPoint = { lat: number; lon: number };
type WeatherCurrent = { temperature_2m: number; weather_code: number };
type CoordinateRange = { min: number; max: number };
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
function nullWeather(init: ResponseInit = {}): Response {
  return NextResponse.json(null, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}
function displayWeather(current: WeatherCurrent): WeatherResult {
  const temperatureC = current.temperature_2m;
  const code = current.weather_code;
  return { temperatureC, temperatureF: Math.round((temperatureC * 9 / 5 + 32) * 10) / 10, code, label: labels[code] ?? "Weather" };
}
function validCurrent(value: unknown): value is { temperature_2m: number; weather_code: number } {
  if (!value || typeof value !== "object") return false;
  const current = value as Record<string, unknown>;
  return typeof current.temperature_2m === "number" && Number.isFinite(current.temperature_2m) && typeof current.weather_code === "number" && Number.isInteger(current.weather_code);
}
function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
async function fetchJson(options: { url: string; fetcher: WeatherFetch }): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await options.fetcher(options.url, { signal: controller.signal, headers: { Accept: "application/json" } });
    return response.ok ? await response.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
export async function fetchWeather(point: WeatherPoint, fetcher: WeatherFetch = fetch): Promise<WeatherResult | null> {
  const body = await fetchJson({ url: providerUrl([rounded(point)]), fetcher });
  const current = body && typeof body === "object" ? (body as { current?: unknown }).current : null;
  return validCurrent(current) ? displayWeather(current) : null;
}

/** Fetches unique grid cells in bounded multi-coordinate provider calls. */
export async function fetchWeatherBatch(
  points: WeatherPoint[], fetcher: WeatherFetch = fetch, batchSize = 50,
): Promise<Map<string, WeatherResult>> {
  return fetchWeatherBatches(getUniqueWeatherPoints(points), fetcher, batchSize);
}
async function fetchWeatherBatches(
  unique: [string, WeatherPoint][], fetcher: WeatherFetch, batchSize: number,
): Promise<Map<string, WeatherResult>> {
  const results = new Map<string, WeatherResult>();
  for (let start = 0; start < unique.length; start += batchSize) {
    const batch = unique.slice(start, start + batchSize);
    const body = await fetchJson({ url: providerUrl(batch.map(([, point]) => point)), fetcher });
    try {
      for (const [key, weather] of parseWeatherBatch(body, batch)) results.set(key, weather);
    } catch (error) {
      console.warn("Open-Meteo weather batch was incomplete", error);
    }
  }
  return results;
}
function getUniqueWeatherPoints(points: WeatherPoint[]): [string, WeatherPoint][] {
  return [...new Map(points.map(point => {
    const cell = rounded(point);
    return [weatherCellKey(cell), cell] as const;
  })).entries()];
}
function parseWeatherBatch(body: unknown, batch: [string, WeatherPoint][]): Map<string, WeatherResult> {
  if (!Array.isArray(body) || body.length !== batch.length) {
    const count = Array.isArray(body) ? body.length : 0;
    throw new Error(`Open-Meteo returned ${count} rows for a ${batch.length}-cell batch`);
  }
  const requested = new Set(batch.map(([key]) => key));
  const results = new Map<string, WeatherResult>();
  for (const row of body) {
    const parsed = parseWeatherRow(row, requested);
    if (!parsed || results.has(parsed[0])) throw new Error("Open-Meteo returned an invalid or duplicate weather row");
    results.set(...parsed);
  }
  if (results.size !== batch.length) throw new Error("Open-Meteo omitted a requested weather cell");
  return results;
}
function parseWeatherRow(row: unknown, requested: Set<string>): [string, WeatherResult] | null {
  if (!isRecord(row)) return null;
  const coordinates = row as OpenMeteoCoordinates;
  if (!hasNumericCoordinates(coordinates)) return null;
  if (!validCurrent(coordinates.current)) return null;
  const key = weatherCellKey({ lat: coordinates.latitude, lon: coordinates.longitude });
  return requested.has(key) ? [key, displayWeather(coordinates.current)] : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
type OpenMeteoCoordinates = { latitude?: unknown; longitude?: unknown; current?: unknown };
function hasNumericCoordinates(value: OpenMeteoCoordinates): value is OpenMeteoCoordinates & { latitude: number; longitude: number } {
  return finiteNumber(value.latitude) && finiteNumber(value.longitude);
}
function parseCoordinate(options: { value: string | null; range: CoordinateRange }): number | null {
  const { value, range } = options;
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= range.min && number <= range.max ? number : null;
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
  const lat = parseCoordinate({ value: params.get("lat"), range: { min: -90, max: 90 } });
  const lon = parseCoordinate({ value: params.get("lon"), range: { min: -180, max: 180 } });
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
  if (enabled === false || process.env.WEATHER_ENABLED === "false") return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("cloudflare:workers") as { env: { WEATHER_ENABLED?: string } };
    return env.WEATHER_ENABLED === "false";
  } catch { return false; }
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
  if (!isRecord(value)) return false;
  const weather = value as Record<string, unknown>;
  return finiteNumber(weather.temperatureC)
    && finiteNumber(weather.temperatureF)
    && integerNumber(weather.code)
    && typeof weather.label === "string";
}
export function parseWeatherValue(value: unknown): WeatherResult | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isWeatherResult(parsed) ? parsed : null;
  } catch { return null; }
}
function integerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

async function readWeatherFromStore(store: WeatherKV | null, key: string): Promise<Response | null> {
  if (!store) return null;
  try {
    const value = await store.get(key);
    if (!value) return null;
    const parsed = parseWeatherValue(value);
    return parsed ? NextResponse.json(parsed, { headers: PUBLIC_WEATHER_HEADERS }) : null;
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
    const weather = await fetchWeather(point, fetcher);
    if (!weather) return nullWeather({ status: 502 });
    await cacheWeatherResult(store, key, weather);
    return NextResponse.json(weather, { headers: PUBLIC_WEATHER_HEADERS });
  } catch { return nullWeather(); }
}
