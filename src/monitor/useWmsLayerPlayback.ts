import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { fetchLayerTimeValues, selectAnimationFrameTimes, type WmsLayerConfig } from './wms';

export interface LayerPlaybackState {
  frameTimes: string[];
  frameIndex: number;
}

export const emptyPlayback = (): LayerPlaybackState => ({
  frameTimes: [],
  frameIndex: 0,
});

export const resolveDisplayTime = (playback: LayerPlaybackState): string | undefined => {
  if (playback.frameTimes.length === 0) {
    return undefined;
  }

  return playback.frameTimes[playback.frameIndex];
};

export const snapToLatestFrame = (current: LayerPlaybackState): LayerPlaybackState => {
  if (current.frameTimes.length === 0) {
    return current;
  }

  const frameIndex = current.frameTimes.length - 1;
  return current.frameIndex === frameIndex ? current : { ...current, frameIndex };
};

export const advancePlaybackFrame = (current: LayerPlaybackState): LayerPlaybackState => {
  if (current.frameTimes.length < 2) {
    return current;
  }

  return {
    ...current,
    frameIndex: (current.frameIndex + 1) % current.frameTimes.length,
  };
};

interface LoadWmsLayerFramesOptions {
  config: WmsLayerConfig | null;
  setPlayback: Dispatch<SetStateAction<LayerPlaybackState>>;
  refreshToken: number;
  addToast: AddToastFn;
  unavailableMessage: string;
}

export const useLoadWmsLayerFrames = ({
  config,
  setPlayback,
  refreshToken,
  addToast,
  unavailableMessage,
}: LoadWmsLayerFramesOptions): void => {
  const configKey = config ? `${config.url}::${config.layer}` : 'off';

  useEffect(() => {
    let active = true;
    setPlayback(emptyPlayback());

    if (config) {
      fetchLayerTimeValues(config)
        .then((timeValues) => {
          if (!active) {
            return undefined;
          }

          const frameTimes = selectAnimationFrameTimes(timeValues);
          setPlayback({
            frameTimes,
            frameIndex: Math.max(0, frameTimes.length - 1),
          });
          return undefined;
        })
        .catch(() => {
          if (active) {
            addToast(unavailableMessage, 'warning');
          }
        });
    }

    return () => {
      active = false;
    };
  }, [addToast, config, configKey, refreshToken, setPlayback, unavailableMessage]);
};
