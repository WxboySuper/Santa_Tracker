import { useCallback, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import type { WmsLayerConfig } from './wms';
import {
  emptyPlayback,
  resolveDisplayTime,
  useLoadWmsLayerFrames,
  type LayerPlaybackState,
} from './useWmsLayerPlayback';
import { useWmsPlaybackLoop } from './useWmsPlaybackLoop';

interface UseLiveWmsLayersArgs {
  radarConfig: WmsLayerConfig | null;
  satelliteConfig: WmsLayerConfig | null;
  animationEnabled: boolean;
  animationSpeedMs: number;
  refreshToken: number;
  addToast: AddToastFn;
}

/** Loads WMS time dimensions and optionally loops the latest frames for radar/satellite. */
export const useLiveWmsLayers = ({
  radarConfig,
  satelliteConfig,
  animationEnabled,
  animationSpeedMs,
  refreshToken,
  addToast,
}: UseLiveWmsLayersArgs) => {
  const [playback, setPlayback] = useState({ radar: emptyPlayback(), satellite: emptyPlayback() });
  const radarPlayback = playback.radar;
  const satellitePlayback = playback.satellite;
  const setRadarPlayback = useCallback((update: LayerPlaybackState | ((current: LayerPlaybackState) => LayerPlaybackState)) => {
    setPlayback((current) => ({
      ...current,
      radar: typeof update === 'function' ? update(current.radar) : update,
    }));
  }, []);
  const setSatellitePlayback = useCallback((update: LayerPlaybackState | ((current: LayerPlaybackState) => LayerPlaybackState)) => {
    setPlayback((current) => ({
      ...current,
      satellite: typeof update === 'function' ? update(current.satellite) : update,
    }));
  }, []);

  useLoadWmsLayerFrames({
    config: radarConfig,
    setPlayback: setRadarPlayback,
    refreshToken,
    addToast,
    unavailableMessage: 'Radar capabilities are unavailable right now.',
  });
  useLoadWmsLayerFrames({
    config: satelliteConfig,
    setPlayback: setSatellitePlayback,
    refreshToken,
    addToast,
    unavailableMessage: 'Satellite capabilities are unavailable right now.',
  });

  const radarHasFrames = radarPlayback.frameTimes.length > 1;
  const satelliteHasFrames = satellitePlayback.frameTimes.length > 1;
  const shouldAnimate = animationEnabled && (radarHasFrames || satelliteHasFrames);
  const frameSignature = `${radarPlayback.frameTimes.join('|')}::${satellitePlayback.frameTimes.join('|')}`;

  useWmsPlaybackLoop({
    shouldAnimate,
    frameSignature,
    animationSpeedMs,
    setPlayback,
  });

  return {
    radarDisplayTime: resolveDisplayTime(radarPlayback),
    satelliteDisplayTime: resolveDisplayTime(satellitePlayback),
  };
};
