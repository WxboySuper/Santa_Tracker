import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { HostedCustomProduct, HostedCustomProductStatus, OneOffCustomLayer } from '../types/customProducts';
import { getCustomProductsRepository, type CustomProductDraft } from '../lib/customProductsRepository';
import { useCustomProductActions } from './useCustomProductActions';
import { useCustomProductSubscription } from './useCustomProductSubscription';

export interface UseCustomProductsResult {
  products: HostedCustomProduct[];
  loading: boolean;
  error: string | null;
  premiumActive: boolean;
  pendingAction: { action: string; productId?: string } | null;
  createProduct(draft: CustomProductDraft): Promise<boolean>;
  updateProduct(product: HostedCustomProduct, draft: CustomProductDraft): Promise<boolean>;
  duplicateProduct(product: HostedCustomProduct): Promise<boolean>;
  setProductStatus(product: HostedCustomProduct, status: HostedCustomProductStatus): Promise<boolean>;
  deleteProduct(product: HostedCustomProduct): Promise<boolean>;
  useProduct(product: HostedCustomProduct): OneOffCustomLayer | null;
}

/** Composes subscription and mutation hooks for the gated reusable-product page. */
export const useCustomProducts = (): UseCustomProductsResult => {
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const repository = useMemo(getCustomProductsRepository, []);
  const subscription = useCustomProductSubscription(repository, user?.uid);
  const actions = useCustomProductActions({
    repository,
    userId: user?.uid,
    premiumActive,
    setError: subscription.setError,
  });
  return { ...subscription.state, ...actions, premiumActive };
};
