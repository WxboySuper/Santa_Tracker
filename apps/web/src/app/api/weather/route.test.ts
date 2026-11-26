import { describe, expect, it, vi } from "vitest";
import { fetchWeather, getWeatherResponse, weatherRouteCellKey, type WeatherKV, type WeatherResult } from "@/lib/weather";
import { GET } from "./route";

const flightNow = Date.UTC(2026, 11, 24, 10);

describe("weather API", () => {
  it("rounds coordinates to the grid and converts temperature", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain("latitude=51.5");
      expect(url).toContain("longitude=0");
      return Response.json({ current: { temperature_2m: 10, weather_code: 3 } });
    });
    await expect(fetchWeather({ lat: 51.49, lon: -0.12 }, fetcher)).resolves.toEqual({ temperatureC: 10, temperatureF: 50, code: 3, label: "Overcast" });
  });
  it("returns null when the provider fails or gives malformed data", async () => {
    await expect(fetchWeather({ lat: 0, lon: 0 }, async () => { throw new Error("offline"); })).resolves.toBeNull();
    await expect(fetchWeather({ lat: 0, lon: 0 }, async () => Response.json({ current: {} }))).resolves.toBeNull();
  });
  it("rejects invalid coordinates and returns the contract", async () => {
    const invalid = await GET(new Request("https://example.test/api/weather?lat=91&lon=0"));
    expect(invalid.status).toBe(400);
    expect((await GET(new Request("https://example.test/api/weather?lat=0"))).status).toBe(400);
    expect((await GET(new Request("https://example.test/api/weather?lat=&lon="))).status).toBe(400);
    const store: WeatherKV = { get: async key => key === weatherRouteCellKey({ lat: 0, lon: 0 }) ? "1" : null, put: async () => undefined };
    const valid = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store, budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }),
      now: flightNow,
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ temperatureC: 10, temperatureF: 50, code: 3, label: "Overcast" });
    vi.unstubAllGlobals();
  });
  it("returns uncached null with a retryable error status when weather is unavailable", async () => {
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store: { get: async key => key === weatherRouteCellKey({ lat: 0, lon: 0 }) ? "1" : null, put: async () => undefined },
      budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => { throw new Error("offline"); },
      now: flightNow,
    });
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toBeNull();
    vi.unstubAllGlobals();
  });
  it.each(["read", "write"] as const)("returns fresh weather if the KV %s fails", async failure => {
    const store: WeatherKV = {
      get: async key => {
        if (key === weatherRouteCellKey({ lat: 0, lon: 0 })) return "1";
        if (failure === "read") throw new Error("KV offline");
        return null;
      },
      put: async () => { if (failure === "write") throw new Error("KV offline"); },
    };
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store,
      budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }),
      now: flightNow,
    });
    expect(response.status).toBe(200);
    expect((await response.json() as WeatherResult).label).toBe("Overcast");
  });
  it("returns null without provider calls when weather is disabled or the budget denies fallback", async () => {
    const fetcher = vi.fn(async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }));
    const request = new Request("https://example.test/api/weather?lat=0&lon=0");
    const disabled = await getWeatherResponse(request, { enabled: false, fetcher });
    const denied = await getWeatherResponse(request, { store: { get: async key => key === weatherRouteCellKey({ lat: 0, lon: 0 }) ? "1" : null, put: async () => undefined }, budget: { fetch: async () => new Response(null, { status: 429 }) }, fetcher, now: flightNow });
    expect(await disabled.json()).toBeNull();
    expect(await denied.json()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed KV values and keeps off-season misses off the provider", async () => {
    const budget = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const fetcher = vi.fn(async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }));
    const store: WeatherKV = { get: async key => key === weatherRouteCellKey({ lat: 0, lon: 0 }) ? "1" : JSON.stringify({ temperatureC: "warm" }), put: async () => undefined };
    const request = new Request("https://example.test/api/weather?lat=0&lon=0");
    const malformed = await getWeatherResponse(request, { store, budget, fetcher, now: flightNow });
    expect((await malformed.json() as WeatherResult).label).toBe("Overcast");
    expect(budget.fetch).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    const offSeason = await getWeatherResponse(request, { store: { get: async () => null, put: async () => undefined }, budget, fetcher, now: Date.UTC(2026, 10, 26) });
    expect(await offSeason.json()).toBeNull();
    expect(budget.fetch).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not spend the fallback budget for cells outside the refreshed route", async () => {
    const budget = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const fetcher = vi.fn(async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }));
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=10&lon=10"), {
      store: { get: async () => null, put: async () => undefined }, budget, fetcher, now: flightNow,
    });
    expect(await response.json()).toBeNull();
    expect(budget.fetch).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
