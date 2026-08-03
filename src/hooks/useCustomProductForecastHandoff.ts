import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { AddToastFn } from '../components/Layout';
import { isFeatureExposed } from '../config/featureExposure';
import {
  consumeCustomProductForecastHandoff,
  restoreCustomProductForecastHandoff,
} from '../lib/customProductHandoff';
import type { RootState } from '../store';
import { addCustomLayer, setCustomEditorMode } from '../store/forecastSlice';
import { CUSTOM_PRODUCT_LIMITS } from '../types/customProducts';

const restoreWithError = (message: string, addToast: AddToastFn, layer: Parameters<typeof restoreCustomProductForecastHandoff>[0]) => {
  restoreCustomProductForecastHandoff(layer);
  addToast(message, 'error');
};

/** Consumes a staged reusable product only after session restoration has established a valid destination. */
export const useCustomProductForecastHandoff = (ready: boolean, addToast: AddToastFn): void => {
  const dispatch = useDispatch();
  const { premiumActive } = useEntitlement();
  const destinationDay = useSelector((state: RootState) => {
    const cycle = state.forecast.forecastCycle;
    return cycle.days[cycle.currentDay];
  });

  useEffect(() => {
    if (!ready || !isFeatureExposed('customProducts')) return;
    const stagedLayer = consumeCustomProductForecastHandoff(premiumActive);
    if (!stagedLayer) return;
    if (!destinationDay) {
      restoreWithError('Select a valid forecast day before loading this product.', addToast, stagedLayer);
      return;
    }
    if ((destinationDay.customLayers?.layers.length ?? 0) >= CUSTOM_PRODUCT_LIMITS.layersPerCollection) {
      restoreWithError(
        `Remove a custom layer before loading this product (maximum ${CUSTOM_PRODUCT_LIMITS.layersPerCollection}).`,
        addToast,
        stagedLayer,
      );
      return;
    }
    dispatch(addCustomLayer(stagedLayer));
    dispatch(setCustomEditorMode('custom'));
  }, [addToast, destinationDay, dispatch, premiumActive, ready]);
};
