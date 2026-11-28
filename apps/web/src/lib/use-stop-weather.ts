"use client";

import { useEffect, useState } from "react";
import type { RouteNode } from "./locations";

export interface StopWeather {
  temperatureC: number;
  temperatureF: number;
  code: number;
  label: string;
}

/** Wait this long on a stop before asking, so fast replays and quick hops don't spend the provider's rate limit. */
const SETTLE_MS = 1500;
const memo = new Map<string, StopWeather | null>();

function isWeather(value: unknown): value is StopWeather {
  const w = value as Partial<StopWeather> | null;
  return Boolean(w && typeof w.temperatureC === "number" && typeof w.temperatureF === "number" && typeof w.label === "string");
}

/** Current weather at the stop Santa is over, from the cached /api/weather endpoint. Null while loading or unavailable. */
export function useStopWeather(node: RouteNode | null | undefined): StopWeather | null {
  const key = node ? `${node.location.lat.toFixed(2)},${node.location.lng.toFixed(2)}` : "";
  const [weather, setWeather] = useState<{ key: string; value: StopWeather | null }>({ key: "", value: null });

  // Depend on the coordinates only: route nodes are rebuilt on every clock tick, which would cancel the timer.
  useEffect(() => {
    if (!key || memo.has(key)) return;
    const [lat, lon] = key.split(",");
    let live = true;
    // Once asked, let the request finish and remember the answer even if Santa moves on: it is cheap and cached.
    const timer = setTimeout(() => {
      fetch(`/api/weather?lat=${lat}&lon=${lon}`)
        .then(response => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          const value = isWeather(data) ? data : null;
          memo.set(key, value);
          if (live) setWeather({ key, value });
        })
        .catch(() => undefined);
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);

  if (!key) return null;
  if (memo.has(key)) return memo.get(key) ?? null;
  return weather.key === key ? weather.value : null;
}
