import { FLIGHT_WINDOW_MS, takeoffForYear } from "./countdown";

const WINDOW_LEAD_MS = 30 * 60 * 1000;

export function isWeatherRefreshOpen(now: number): boolean {
  const year = new Date(now).getUTCFullYear();
  return [year - 1, year, year + 1].some(candidate => {
    const takeoff = takeoffForYear(candidate);
    return now >= takeoff - WINDOW_LEAD_MS && now < takeoff + FLIGHT_WINDOW_MS;
  });
}
