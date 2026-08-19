import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  advancePlaybackFrame,
  snapToLatestFrame,
  type LayerPlaybackState,
} from './useWmsLayerPlayback';

interface WmsPlaybackLoopOptions {
  shouldAnimate: boolean;
  frameSignature: string;
  animationSpeedMs: number;
  setPlayback: Dispatch<SetStateAction<{ radar: LayerPlaybackState; satellite: LayerPlaybackState }>>;
}

export const useWmsPlaybackLoop = ({
  shouldAnimate,
  frameSignature,
  animationSpeedMs,
  setPlayback,
}: WmsPlaybackLoopOptions) => {
  useEffect(() => {
    if (!shouldAnimate) {
      setPlayback((current) => ({
        radar: snapToLatestFrame(current.radar),
        satellite: snapToLatestFrame(current.satellite),
      }));
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setPlayback((current) => ({
        radar: advancePlaybackFrame(current.radar),
        satellite: advancePlaybackFrame(current.satellite),
      }));
    }, animationSpeedMs);

    return () => window.clearInterval(intervalId);
  }, [animationSpeedMs, frameSignature, setPlayback, shouldAnimate]);
};
