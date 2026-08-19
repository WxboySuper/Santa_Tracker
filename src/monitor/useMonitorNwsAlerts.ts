import { useMemo, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import { filterNwsAlertCollection, type NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlertsLoad } from './useMonitorNwsAlertsLoad';
import { useMonitorNwsAlertsPlayback } from './useMonitorNwsAlertsPlayback';

interface UseMonitorNwsAlertsArgs {
  enabled: boolean;
  showWatches: boolean;
  showWarnings: boolean;
  showAdvisories: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  refreshToken: number;
  addToast: AddToastFn;
}

const EMPTY_COLLECTION: NwsAlertFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export const useMonitorNwsAlerts = ({
  enabled,
  showWatches,
  showWarnings,
  showAdvisories,
  animationEnabled,
  animationSpeedMs,
  refreshToken,
  addToast,
}: UseMonitorNwsAlertsArgs) => {
  const [rawFrames, setRawFrames] = useState<NwsAlertFeatureCollection[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const filterOptions = useMemo(
    () => ({ showWatches, showWarnings, showAdvisories }),
    [showAdvisories, showWarnings, showWatches],
  );

  const filteredFrames = useMemo(
    () => rawFrames.map((frame) => filterNwsAlertCollection(frame, filterOptions)),
    [filterOptions, rawFrames],
  );

  useMonitorNwsAlertsLoad({
    enabled,
    refreshToken,
    addToast,
    setRawFrames,
    setFrameIndex,
    setLoading,
    setError,
    setFetchedAt,
  });

  useMonitorNwsAlertsPlayback({
    enabled,
    animationEnabled,
    animationSpeedMs,
    filteredFrameCount: filteredFrames.length,
    rawFrameCount: rawFrames.length,
    setRawFrames,
    setFrameIndex,
    setFetchedAt,
  });

  const activeCollection = useMemo(() => {
    if (!enabled || filteredFrames.length === 0) {
      return EMPTY_COLLECTION;
    }

    if (animationEnabled && filteredFrames.length > 1) {
      return filteredFrames[frameIndex] ?? filteredFrames[filteredFrames.length - 1] ?? EMPTY_COLLECTION;
    }

    return filteredFrames[filteredFrames.length - 1] ?? EMPTY_COLLECTION;
  }, [animationEnabled, enabled, filteredFrames, frameIndex]);

  return {
    alertCollection: activeCollection,
    frameCount: filteredFrames.length,
    frameIndex: animationEnabled ? frameIndex : Math.max(0, filteredFrames.length - 1),
    loading,
    error,
    fetchedAt,
    polygonCount: activeCollection.features.length,
  };
};
