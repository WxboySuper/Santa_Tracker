import { describe, expect, it } from "vitest";
import { refreshWeather, weatherRoutePoints, WEATHER_BATCH_SIZE, isWeatherRefreshOpen } from "./weather-refresh";
import type { RouteNode } from "./locations";
import { fetchWeatherBatch, getWeatherResponse, weatherCellKey, type WeatherKV } from "./weather";

const takeoff = Date.UTC(2026, 11, 24, 10);

function fixtureRoute(): RouteNode[] {
  return Array.from({ length: 600 }, (_, index) => ({
    id: `stop-${index}`, type: "DELIVERY",
    location: { name: `Stop ${index}`, lat: -70 + (index % 280) * 0.5, lng: -175 + Math.floor(index / 280) * 30 + (index % 10) * 0.5 },
    schedule: { arrival_utc: new Date(takeoff + index * (26 * 60 * 60_000 / 600)).toISOString() },
  }));
}

function expiringStore(getTime: () => number): WeatherKV {
  const values = new Map<string, { value: string; expiresAt: number }>();
  return {
    get: async key => {
      const entry = values.get(key);
      return entry && entry.expiresAt > getTime() ? entry.value : null;
    },
    put: async (key, value, options) => { values.set(key, { value, expiresAt: getTime() + (options?.expirationTtl ?? 1800) * 1000 }); },
  };
}

describe("scheduled weather refresh", () => {
  it("gates the cron to the half-hour before takeoff through the 26-hour replay window", () => {
    expect(isWeatherRefreshOpen(takeoff - 30 * 60_000)).toBe(true);
    expect(isWeatherRefreshOpen(takeoff - 30 * 60_000 - 1)).toBe(false);
    expect(isWeatherRefreshOpen(takeoff + 26 * 60 * 60_000 - 1)).toBe(true);
    expect(isWeatherRefreshOpen(takeoff + 26 * 60 * 60_000)).toBe(false);
  });

  it("splits provider URLs at 50 unique grid cells", async () => {
    const calls: URL[] = [];
    const points = Array.from({ length: 121 }, (_, index) => ({ lat: -60 + index * 0.25, lon: -150 + index * 0.25 }));
    await fetchWeatherBatch(points, async input => {
      const url = new URL(input as string);
      calls.push(url);
      const coordinates = url.searchParams.get("latitude")!.split(",");
      return Response.json(coordinates.map(() => ({ current: { temperature_2m: 2, weather_code: 0 } })));
    }, WEATHER_BATCH_SIZE);
    expect(calls).toHaveLength(3);
    expect(calls.map(url => url.searchParams.get("latitude")!.split(",").length)).toEqual([50, 50, 21]);
  });

  it("keeps the simulated full-flight provider call total under 1,000 regardless of visitor count", async () => {
    const route = fixtureRoute();
    let clock = takeoff - 30 * 60_000;
    const store = expiringStore(() => clock);
    let calls = 0;
    const provider = async (input: RequestInfo | URL) => {
      calls += 1;
      const coords = new URL(String(input)).searchParams.get("latitude")!.split(",");
      return Response.json(coords.map(() => ({ current: { temperature_2m: 0, weather_code: 1 } })));
    };
    const end = takeoff + 26 * 60 * 60_000;
    for (; clock < end; clock += 15 * 60_000) await refreshWeather(clock, route, store, provider);
    expect(calls).toBe(106);
    expect(calls).toBeLessThan(1000);
    expect(weatherRoutePoints(route, takeoff).length).toBeGreaterThan(1);
    const providerCallsAfterFlight = calls;
    const cached = JSON.stringify({ temperatureC: 0, temperatureF: 32, code: 1, label: "Mostly clear" });
    const sharedStore: WeatherKV = { get: async key => key === weatherCellKey({ lat: 0, lon: 0 }) ? cached : null, put: async () => undefined };
    const visitors = await Promise.all(Array.from({ length: 500 }, () => getWeatherResponse(
      new Request("https://example.test/api/weather?lat=0&lon=0"), { store: sharedStore },
    )));
    expect(visitors.every(response => response.status === 200)).toBe(true);
    expect(calls).toBe(providerCallsAfterFlight);
  });
});
