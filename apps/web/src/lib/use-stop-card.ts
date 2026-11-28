"use client";

import { useEffect, useState } from "react";
import type { RouteNode } from "./locations";
import type { StopCardView } from "./stop-cards";

type CardMap = Record<string, StopCardView>;

// One request per page: every stop's card arrives together and the map is reused as Santa moves on.
let cards: CardMap | null = null;
let pending: Promise<CardMap> | null = null;

function loadCards(): Promise<CardMap> {
  pending ??= fetch("/api/stop-cards")
    .then(response => (response.ok ? response.json() as Promise<CardMap> : {}))
    .catch(() => ({}))
    .then(map => {
      cards = map;
      return map;
    });
  return pending;
}

/** The sourced note and photo for the stop Santa is over, or null when the place has no card yet. */
export function useStopCard(node: RouteNode | null | undefined): StopCardView | null {
  const [map, setMap] = useState<CardMap | null>(cards);
  useEffect(() => {
    if (map) return;
    let live = true;
    void loadCards().then(loaded => { if (live) setMap(loaded); });
    return () => { live = false; };
  }, [map]);
  const id = node?.candidate_id;
  return (id && map?.[id]) || null;
}
