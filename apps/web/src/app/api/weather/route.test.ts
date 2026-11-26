import { describe, expect, it, vi } from "vitest";
import { fetchWeather, getWeatherResponse, type WeatherKV, type WeatherResult } from "@/lib/weather";
import { GET } from "./route";

describe("weather API", () => {
  it("rounds coordinates to the grid and converts temperature", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain("latitude=51.5");
      expect(url).toContain("longitude=0");
      return Response.json({ current: { temperature_2m: 10, weather_code: 3 } });
    });
    await expect(fetchWeather(51.49, -0.12, fetcher)).resolves.toEqual({ temperatureC: 10, temperatureF: 50, code: 3, label: "Overcast" });
  });
  it("returns null when the provider fails or gives malformed data", async () => {
    await expect(fetchWeather(0, 0, async () => { throw new Error("offline"); })).resolves.toBeNull();
    await expect(fetchWeather(0, 0, async () => Response.json({ current: {} }))).resolves.toBeNull();
  });
  it("rejects invalid coordinates and returns the contract", async () => {
    const invalid = await GET(new Request("https://example.test/api/weather?lat=91&lon=0"));
    expect(invalid.status).toBe(400);
    expect((await GET(new Request("https://example.test/api/weather?lat=0"))).status).toBe(400);
    expect((await GET(new Request("https://example.test/api/weather?lat=&lon="))).status).toBe(400);
    const store: WeatherKV = { get: async () => null, put: async () => undefined };
    const valid = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store, budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }),
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ temperatureC: 10, temperatureF: 50, code: 3, label: "Overcast" });
    vi.unstubAllGlobals();
  });
  it("returns uncached null with a retryable error status when weather is unavailable", async () => {
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => { throw new Error("offline"); },
    });
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toBeNull();
    vi.unstubAllGlobals();
  });
  it("returns fresh weather if the edge cache write fails", async () => {
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store: { get: async () => null, put: async () => { throw new Error("cache offline"); } },
      budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as WeatherResult).label).toBe("Overcast");
    vi.unstubAllGlobals();
  });
  it("fetches fresh weather if the edge cache read fails", async () => {
    const response = await getWeatherResponse(new Request("https://example.test/api/weather?lat=0&lon=0"), {
      store: { get: async () => { throw new Error("cache offline"); }, put: async () => undefined },
      budget: { fetch: async () => new Response(null, { status: 204 }) },
      fetcher: async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as WeatherResult).label).toBe("Overcast");
  });
  it("returns null without provider calls when weather is disabled or the budget denies fallback", async () => {
    const fetcher = vi.fn(async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }));
    const request = new Request("https://example.test/api/weather?lat=0&lon=0");
    const disabled = await getWeatherResponse(request, { enabled: false, fetcher });
    const denied = await getWeatherResponse(request, { store: { get: async () => null, put: async () => undefined }, budget: { fetch: async () => new Response(null, { status: 429 }) }, fetcher });
    expect(await disabled.json()).toBeNull();
    expect(await denied.json()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
