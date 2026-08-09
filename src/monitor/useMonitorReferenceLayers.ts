import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { captureExpectedMonitorReferenceFailure } from '../instrument';
import {
  fetchSpcMesoscaleDiscussions,
  SPC_MESOSCALE_DISCUSSION_SOURCE,
  withReferenceRetry,
  type MonitorMesoscaleDiscussionCollection,
  type MonitorReferenceLayerMeta,
  type MonitorReferenceLayerStatus,
} from './referenceLayers';

const REFERENCE_CACHE_TTL_MS = 10 * 60 * 1000;
const REFERENCE_STALE_WINDOW_MS = 30 * 60 * 1000;

interface CachedSpcSnapshot {
  collection: MonitorMesoscaleDiscussionCollection;
  fetchedAt: number;
}

const lastFailureToastAt = new Map<string, number>();

export interface MonitorReferenceLayersState {
  spcMesoscaleDiscussion: MonitorReferenceLayerMeta;
  mesoscaleDiscussions: MonitorMesoscaleDiscussionCollection;
}

const emptyCollection = (): MonitorMesoscaleDiscussionCollection => ({
  type: 'FeatureCollection',
  features: [],
});

const createMeta = ({
  status,
  sourceName,
  sourceUrl,
  attribution,
  fetchedAt = null,
  validTime = null,
  itemCount = 0,
  error = null,
}: {
  status: MonitorReferenceLayerStatus;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  fetchedAt?: string | null;
  validTime?: string | null;
  itemCount?: number;
  error?: string | null;
}): MonitorReferenceLayerMeta => ({
  status,
  sourceName,
  sourceUrl,
  attribution,
  fetchedAt,
  validTime,
  itemCount,
  error,
});

const createInitialState = (): MonitorReferenceLayersState => ({
  spcMesoscaleDiscussion: createMeta({
    status: 'idle',
    sourceName: SPC_MESOSCALE_DISCUSSION_SOURCE.sourceName,
    sourceUrl: SPC_MESOSCALE_DISCUSSION_SOURCE.sourceUrl,
    attribution: SPC_MESOSCALE_DISCUSSION_SOURCE.attribution,
  }),
  mesoscaleDiscussions: emptyCollection(),
});

const isParseableInstant = (value: string | undefined): value is string =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));

const latestValidTime = (collection: MonitorMesoscaleDiscussionCollection): string | null => {
  const validTimes = collection.features
    .map(({ properties }) => properties.validTo ?? properties.validFrom)
    .filter(isParseableInstant);

  return validTimes.sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1) ?? null;
};

type MetaDetails = Partial<Pick<MonitorReferenceLayerMeta, 'fetchedAt' | 'validTime' | 'itemCount' | 'error'>>;

const createSpcMeta = (status: MonitorReferenceLayerStatus, details: MetaDetails = {}): MonitorReferenceLayerMeta => createMeta({
  status,
  sourceName: SPC_MESOSCALE_DISCUSSION_SOURCE.sourceName,
  sourceUrl: SPC_MESOSCALE_DISCUSSION_SOURCE.sourceUrl,
  attribution: SPC_MESOSCALE_DISCUSSION_SOURCE.attribution,
  ...details,
});

const notifyReferenceFailure = (message: string, addToast?: AddToastFn): void => {
  const now = Date.now();
  const sourceId = SPC_MESOSCALE_DISCUSSION_SOURCE.id;
  const lastShownAt = lastFailureToastAt.get(sourceId) ?? 0;
  if (now - lastShownAt < 60_000) return;
  lastFailureToastAt.set(sourceId, now);
  addToast?.(message, 'warning');
};

interface UseMonitorReferenceLayersArgs {
  spcEnabled: boolean;
  refreshToken: number;
  addToast?: AddToastFn;
}

type SetReferenceState = Dispatch<SetStateAction<MonitorReferenceLayersState>>;

const isFresh = (fetchedAt: number, refreshToken: number): boolean =>
  Date.now() - fetchedAt <= REFERENCE_CACHE_TTL_MS && refreshToken === 0;

const startSpcReferenceEffect = ({
  enabled,
  refreshToken,
  addToast,
  setState,
  cacheRef,
}: {
  enabled: boolean;
  refreshToken: number;
  addToast?: AddToastFn;
  setState: SetReferenceState;
  cacheRef: { current: CachedSpcSnapshot | null };
}): (() => void) => {
  let active = true;

  if (!enabled) {
    setState((current) => ({
      ...current,
      mesoscaleDiscussions: emptyCollection(),
      spcMesoscaleDiscussion: createSpcMeta('idle'),
    }));
    return () => { active = false; };
  }

  const cached = cacheRef.current;
  if (cached && isFresh(cached.fetchedAt, refreshToken)) {
    setState((current) => ({
      ...current,
      mesoscaleDiscussions: cached.collection,
      spcMesoscaleDiscussion: createSpcMeta(cached.collection.features.length > 0 ? 'ready' : 'empty', {
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        validTime: latestValidTime(cached.collection),
        itemCount: cached.collection.features.length,
      }),
    }));
    return () => { active = false; };
  }

  setState((current) => ({ ...current, spcMesoscaleDiscussion: createSpcMeta('loading', {
    fetchedAt: current.spcMesoscaleDiscussion.fetchedAt,
    validTime: current.spcMesoscaleDiscussion.validTime,
    itemCount: current.spcMesoscaleDiscussion.itemCount,
    error: null,
  }) }));
  withReferenceRetry(fetchSpcMesoscaleDiscussions)
    .then((collection) => {
      if (!active) return;
      const fetchedAt = Date.now();
      cacheRef.current = { collection, fetchedAt };
      setState((current) => ({
        ...current,
        mesoscaleDiscussions: collection,
        spcMesoscaleDiscussion: createSpcMeta(collection.features.length > 0 ? 'ready' : 'empty', {
          fetchedAt: new Date(fetchedAt).toISOString(),
          validTime: latestValidTime(collection),
          itemCount: collection.features.length,
        }),
      }));
    })
    .catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : 'SPC mesoscale discussions are unavailable.';
      captureExpectedMonitorReferenceFailure('spc-mesoscale-discussion', error);
      const latestCache = cacheRef.current;
      const cacheAge = latestCache ? Date.now() - latestCache.fetchedAt : Number.POSITIVE_INFINITY;
      if (latestCache && cacheAge <= REFERENCE_STALE_WINDOW_MS) {
        setState((current) => ({
          ...current,
          mesoscaleDiscussions: latestCache.collection,
          spcMesoscaleDiscussion: createSpcMeta('stale', {
            fetchedAt: new Date(latestCache.fetchedAt).toISOString(),
            validTime: latestValidTime(latestCache.collection),
            itemCount: latestCache.collection.features.length,
            error: message,
          }),
        }));
      } else {
        setState((current) => ({
          ...current,
          mesoscaleDiscussions: emptyCollection(),
          spcMesoscaleDiscussion: createSpcMeta('error', { error: message }),
        }));
      }
      notifyReferenceFailure('SPC mesoscale discussions are unavailable; Monitor remains usable.', addToast);
    });

  return () => { active = false; };
};

/** Loads only the SPC MCD reference product for this release. */
export const useMonitorReferenceLayers = ({
  spcEnabled,
  refreshToken,
  addToast,
}: UseMonitorReferenceLayersArgs): MonitorReferenceLayersState => {
  const [state, setState] = useState<MonitorReferenceLayersState>(createInitialState);
  const spcCacheRef = useRef<CachedSpcSnapshot | null>(null);

  useEffect(() => () => {
    spcCacheRef.current = null;
  }, []);

  useEffect(() => startSpcReferenceEffect({
    enabled: spcEnabled,
    refreshToken,
    addToast,
    setState,
    cacheRef: spcCacheRef,
  }), [addToast, refreshToken, spcEnabled]);

  return state;
};
