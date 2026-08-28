"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type * as Leaflet from "leaflet";
import { createTranslator } from "@santa-tracker/localization";
import type { RouteNode } from "@/lib/locations";
import Countdown from "@/components/countdown";

interface TrackerMapProps {
  adventEnabled: boolean;
  locale: string;
}

interface RouteResponse {
  route_nodes: RouteNode[];
}
type LeafletModule = typeof Leaflet;

function hasCoordinates(node: RouteNode): boolean {
  return Number.isFinite(node.location.lat) && Number.isFinite(node.location.lng);
}

function addStopMarker(L: LeafletModule, map: LeafletMap, node: RouteNode): void {
  L.circleMarker([node.location.lat, node.location.lng], {
    color: "#fbbf24",
    fillColor: "#dc2626",
    fillOpacity: 0.9,
    radius: 5,
    weight: 2,
  })
    .bindTooltip(node.location.name, { direction: "top" })
    .addTo(map);
}

function renderRoute(L: LeafletModule, map: LeafletMap, nodes: RouteNode[]): number {
  const validNodes = nodes.filter(hasCoordinates);
  const points = validNodes.map(node => [node.location.lat, node.location.lng] as [number, number]);
  validNodes.forEach(node => addStopMarker(L, map, node));
  if (points.length > 1) {
    const line = L.polyline(points, { color: "#fbbf24", opacity: 0.85, weight: 3 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [32, 32] });
  }
  return points.length;
}

async function createTrackerMap(container: HTMLDivElement): Promise<{ map: LeafletMap; stopCount: number }> {
  const [{ default: L }, response] = await Promise.all([
    import("leaflet"),
    fetch("/api/route", { cache: "no-store" }),
  ]);
  if (!response.ok) throw new Error(`Route request failed with ${response.status}`);
  const data = (await response.json()) as RouteResponse;
  const map = L.map(container, { worldCopyJump: true, zoomControl: false }).setView([20, 0], 2);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);
  return { map, stopCount: renderRoute(L, map, data.route_nodes) };
}

export default function TrackerMap({ adventEnabled, locale }: TrackerMapProps) {
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const mapElement = useRef<HTMLDivElement>(null);
  const [routeStatus, setRouteStatus] = useState(translator.t("tracker.loading"));

  useEffect(() => {
    let map: LeafletMap | undefined;
    let cancelled = false;
    const initializeMap = async () => {
      try {
        if (!mapElement.current) return;
        const result = await createTrackerMap(mapElement.current);
        if (cancelled) {
          result.map.remove();
          return;
        }
        map = result.map;
        setRouteStatus(translator.t("tracker.loaded", { count: result.stopCount }));
      } catch (error: unknown) {
        if (!cancelled) {
          console.error("Tracker map error", error);
          setRouteStatus(translator.t("tracker.unavailable"));
        }
      }
    };
    void initializeMap();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [translator]);

  return (
    <>
      <nav className="glass-nav fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-white/20 backdrop-blur-md rounded-full px-6 py-2 flex gap-4">
        <Link href="/" className="nav-link text-white/80 hover:text-white">{translator.t("nav.home")}</Link>
        <Link href="/tracker" className="nav-link nav-link-active text-white font-semibold">{translator.t("nav.tracker")}</Link>
        {adventEnabled && <Link href="/advent" className="nav-link text-white/80 hover:text-white">{translator.t("nav.village")}</Link>}
      </nav>
      <div className="map-fullscreen relative w-screen h-screen">
        <div ref={mapElement} className="map w-full h-full bg-blue-950" aria-label={translator.t("tracker.mapLabel")} role="application" tabIndex={0}>
          <p className="absolute left-4 bottom-4 z-[1000] rounded-lg bg-black/60 px-3 py-2 text-sm text-white/80" aria-live="polite">{routeStatus}</p>
        </div>
        <div className="countdown-hud absolute top-20 right-4 bg-black/40 backdrop-blur-md rounded-xl p-4 text-white">
          <p className="countdown-hud-label text-xs opacity-70">{translator.t("home.countdown")}</p>
          <Countdown locale={locale} className="countdown-hud-value font-mono text-lg" flyingText={translator.t("countdown.flying")} />
        </div>
      </div>
    </>
  );
}
