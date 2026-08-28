import { useCallback, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { selectCurrentOutlooks, trimCurrentDayOutlooksToLand } from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import { ensureLandMask } from '../utils/outlookPolygonMasking/landMaskRuntime';
import type { LandMaskStrategy } from '../utils/outlookPolygonMasking/types';
import { trimOutlookGeometry } from '../utils/outlookPolygonMasking/trimOutlookGeometry';
import type { Polygon, MultiPolygon } from 'geojson';
import type { OutlookType } from '../types/outlooks';

interface UseTrimCurrentDayOutlooksOptions {
  addToast: AddToastFn;
}

/** Runs the on-demand trim action after preloading the cached land mask. */
// @codescene(disable:"Complex Method")
export const useTrimCurrentDayOutlooks = ({ addToast }: UseTrimCurrentDayOutlooksOptions) => {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const strategy = useSelector((state: RootState) => state.overlays.outlookTrimStrategy);
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const currentOutlooks = useSelector(selectCurrentOutlooks);
  const [isTrimming, setIsTrimming] = useState(false);

  const trimCurrentDayOutlooks = useCallback(async () => {
    const trimDay = currentDay;
    setIsTrimming(true);
    try {
      const landMask = await ensureLandMask(strategy);
      if (!landMask) {
        addToast('Land mask could not be built for trimming.', 'error');
        return;
      }

      const hasOutlooks = (Object.keys(currentOutlooks) as OutlookType[]).some(
        (outlookType) => (currentOutlooks[outlookType]?.size ?? 0) > 0,
      );
      if (!hasOutlooks) {
        addToast(`No outlook polygons to trim on day ${trimDay}.`, 'info');
        return;
      }

      dispatch(trimCurrentDayOutlooksToLand({ strategy, day: trimDay }));
      const result = store.getState().forecast.lastTrimResult;
      if (!result || result.failedCount > 0) {
        addToast(
          `Trimmed outlooks on day ${trimDay} with ${result?.failedCount ?? 0} failure(s).`,
          'error',
        );
      } else if (result.trimmedCount === 0 && result.removedCount === 0) {
        addToast(`No outlook polygons changed on day ${trimDay}.`, 'info');
      } else {
        addToast(
          `Trimmed outlooks on day ${trimDay}: ${result.trimmedCount} adjusted, ${result.removedCount} removed.`,
          'success',
        );
      }
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to trim outlook polygons.',
        'error',
      );
    } finally {
      setIsTrimming(false);
    }
  }, [addToast, currentDay, currentOutlooks, dispatch, store, strategy]);

  return { trimCurrentDayOutlooks, isTrimming };
};

/** Applies auto-trim to one geometry when enabled and not in preview-only mode. */
export const trimGeometryForAutoDraw = async (
  geometry: Polygon | MultiPolygon,
  strategy: LandMaskStrategy,
  autoOnDraw: boolean,
  previewOnly: boolean,
): Promise<Polygon | MultiPolygon | null> => {
  if (!autoOnDraw || previewOnly) {
    return geometry;
  }

  const landMask = await ensureLandMask(strategy);
  if (!landMask) {
    return geometry;
  }

  const trimmed = trimOutlookGeometry(geometry, landMask, strategy);
  if (trimmed.error) {
    throw new Error(trimmed.error);
  }
  return trimmed.geometry;
};
