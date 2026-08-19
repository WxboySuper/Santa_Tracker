import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { fetchActiveNwsAlerts, snapshotCollectionsEqual, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

const appendSnapshotFrame = (
  current: NwsAlertFeatureCollection[],
  collection: NwsAlertFeatureCollection,
): NwsAlertFeatureCollection[] => {
  const last = current[current.length - 1];
  if (last && snapshotCollectionsEqual(last, collection)) {
    return current;
  }

  return [...current, collection].slice(-MAX_ANIMATION_FRAMES);
};

interface UseMonitorNwsAlertsLoadOptions {
  enabled: boolean;
  refreshToken: number;
  addToast: AddToastFn;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFrameIndex: Dispatch<SetStateAction<number>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

export const useMonitorNwsAlertsLoad = ({
  enabled,
  refreshToken,
  addToast,
  setRawFrames,
  setFrameIndex,
  setLoading,
  setError,
  setFetchedAt,
}: UseMonitorNwsAlertsLoadOptions) => {
  useEffect(() => {
    if (!enabled) {
      setRawFrames([]);
      setFrameIndex(0);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchActiveNwsAlerts()
      .then((collection) => {
        if (!active) {
          return undefined;
        }

        const nextFrames = appendSnapshotFrame([], collection);
        setRawFrames(nextFrames);
        setFrameIndex(Math.max(0, nextFrames.length - 1));
        setFetchedAt(new Date().toISOString());
        return undefined;
      })
      .catch(() => {
        if (!active) {
          return undefined;
        }

        setRawFrames([]);
        setError('Official alerts are unavailable right now.');
        addToast('NWS watch/warning polygons could not be loaded.', 'warning');
        return undefined;
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, enabled, refreshToken, setError, setFetchedAt, setFrameIndex, setLoading, setRawFrames]);
};
