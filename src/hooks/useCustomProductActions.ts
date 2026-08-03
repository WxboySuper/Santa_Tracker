import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { HostedCustomProduct, OneOffCustomLayer } from '../types/customProducts';
import type { CustomProductsRepository } from '../lib/customProductsRepository';
import { stageCustomProductForForecast } from '../lib/customProductHandoff';
import { useCustomProductCrudActions } from './useCustomProductCrudActions';
import { useCustomProductWriter } from './useCustomProductWriter';

const handoffError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to load custom product.';

export const useCustomProductActions = ({
  repository,
  userId,
  premiumActive,
  setError,
}: {
  repository: CustomProductsRepository;
  userId?: string;
  premiumActive: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}) => {
  const { pendingAction, runWrite } = useCustomProductWriter({ userId, premiumActive, setError });
  const crudActions = useCustomProductCrudActions(repository, runWrite);
  const useProduct = useCallback((product: HostedCustomProduct): OneOffCustomLayer | null => {
    try {
      setError(null);
      return stageCustomProductForForecast(product, premiumActive);
    } catch (error) {
      setError(handoffError(error));
      return null;
    }
  }, [premiumActive, setError]);

  return {
    pendingAction,
    ...crudActions,
    useProduct,
  };
};
