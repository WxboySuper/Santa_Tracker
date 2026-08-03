import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { HostedCustomProduct } from '../types/customProducts';
import type { CustomProductsRepository } from '../lib/customProductsRepository';

interface CustomProductSubscriptionState {
  products: HostedCustomProduct[];
  loading: boolean;
  error: string | null;
}

export const useCustomProductSubscription = (
  repository: CustomProductsRepository,
  userId?: string,
): {
  state: CustomProductSubscriptionState;
  setError: Dispatch<SetStateAction<string | null>>;
} => {
  const [products, setProducts] = useState<HostedCustomProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProducts([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return repository.subscribe(userId, (nextProducts) => {
      setProducts(nextProducts);
      setLoading(false);
      setError(null);
    }, (nextError) => {
      setError(nextError.message);
      setLoading(false);
    });
  }, [repository, userId]);

  const state = useMemo(() => ({ products, loading, error }), [error, loading, products]);
  return { state, setError };
};
