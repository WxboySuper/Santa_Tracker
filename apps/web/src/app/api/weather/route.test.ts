import { describe, expect, it, vi } from "vitest";
import { fetchWeather, GET } from "./route";

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
    vi.stubGlobal("fetch", async () => Response.json({ current: { temperature_2m: 10, weather_code: 3 } }));
    const valid = await GET(new Request("https://example.test/api/weather?lat=0&lon=0"));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ temperatureC: 10, temperatureF: 50, code: 3, label: "Overcast" });
    vi.unstubAllGlobals();
  });
  it("returns uncached null with a retryable error status when weather is unavailable", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    const response = await GET(new Request("https://example.test/api/weather?lat=0&lon=0"));
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toBeNull();
    vi.unstubAllGlobals();
  });
});
