import { getWeatherResponse } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getWeatherResponse(request);
}
