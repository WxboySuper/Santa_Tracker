import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
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

interface MonitorNwsAlertsRefreshOptions {
  enabled: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

export const useMonitorNwsAlertsRefresh = ({
  enabled,
  animationEnabled,
  animationSpeedMs,
  setRawFrames,
  setFetchedAt,
}: MonitorNwsAlertsRefreshOptions) => {
  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchActiveNwsAlerts()
        .then((collection) => {
          setRawFrames((current) => appendSnapshotFrame(current, collection));
          setFetchedAt(new Date().toISOString());
        })
        .catch(() => undefined);
    }, Math.max(animationSpeedMs * 4, 15_000));

    return () => window.clearInterval(intervalId);
  }, [animationEnabled, animationSpeedMs, enabled, setFetchedAt, setRawFrames]);
};
