import type { CustomProductId, HostedCustomProduct, OneOffCustomLayer } from '../types/customProducts';
import {
  asCustomLayerId,
  createLayerFromHostedProduct,
  isOneOffCustomLayer,
} from './customProducts';

export const CUSTOM_PRODUCT_HANDOFF_KEY = 'gfc-custom-product-handoff';

/** Restores a validated handoff when the forecast cannot accept it yet. */
export const restoreCustomProductForecastHandoff = (layer: OneOffCustomLayer): void => {
  if (!isOneOffCustomLayer(layer)) throw new TypeError('Cannot restore an invalid custom product handoff.');
  sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(layer));
};

/** Stages a detached empty layer for the forecast editor to consume without retaining a live template reference. */
export const stageCustomProductForForecast = (
  product: HostedCustomProduct,
  premiumActive: boolean,
): OneOffCustomLayer => {
  if (!premiumActive) throw new Error('Premium is required to use a reusable product in a new map.');
  if (product.status !== 'active') throw new Error('Archived products cannot be loaded into a new map.');
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const layer = createLayerFromHostedProduct({
    product,
    layerId: asCustomLayerId(`custom-${nonce}`),
    order: 0,
  });
  restoreCustomProductForecastHandoff(layer);
  return layer;
};

/** Consumes only a fully validated staged layer and clears malformed handoffs defensively. */
export const consumeCustomProductForecastHandoff = (premiumActive: boolean): OneOffCustomLayer | null => {
  const serialized = sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return null;
  sessionStorage.removeItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!premiumActive) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return isOneOffCustomLayer(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Clears a staged layer only when it was created from the deleted product. */
export const clearCustomProductForecastHandoff = (sourceProductId: CustomProductId): void => {
  const serialized = sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isOneOffCustomLayer(parsed) && parsed.productSnapshot?.sourceProductId === sourceProductId) {
      sessionStorage.removeItem(CUSTOM_PRODUCT_HANDOFF_KEY);
    }
  } catch {
    sessionStorage.removeItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  }
};
