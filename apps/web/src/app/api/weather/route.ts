import { fetchWeather, getWeatherPoint, getWeatherResponse } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Local development and the demo have no weather store or cron Worker, and run outside the flight window, so ask
  // the provider directly. Production keeps the bounded, route-only path.
  if (process.env.NODE_ENV !== "production") {
    const point = getWeatherPoint(request);
    if (!point) return Response.json({ error: "Invalid coordinates" }, { status: 400 });
    return Response.json(await fetchWeather(point), { headers: { "Cache-Control": "no-store" } });
  }
  return getWeatherResponse(request);
}
