import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export type PendingCustomProductAction = { action: string; productId?: string } | null;
export type RunCustomProductWrite = (
  action: string,
  productId: string | undefined,
  operation: (resolvedUserId: string) => Promise<unknown>,
  requiresPremium?: boolean,
) => Promise<boolean>;

const mutationError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update custom products.';

/** Serializes entitlement-checked custom-product writes and reports their UI state. */
export const useCustomProductWriter = ({
  userId,
  premiumActive,
  setError,
}: {
  userId?: string;
  premiumActive: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}): { pendingAction: PendingCustomProductAction; runWrite: RunCustomProductWrite } => {
  const [pendingAction, setPendingAction] = useState<PendingCustomProductAction>(null);
  const pendingRef = useRef(false);

  const runWrite = useCallback<RunCustomProductWrite>(async (
    action, productId, operation, requiresPremium = true,
  ) => {
    if (!userId) {
      setError('Sign in to manage reusable products.');
      return false;
    }
    if (requiresPremium && !premiumActive) {
      setError('Premium is required to change reusable products.');
      return false;
    }
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPendingAction({ action, ...(productId ? { productId } : {}) });
    try {
      setError(null);
      await operation(userId);
      return true;
    } catch (error) {
      setError(mutationError(error));
      return false;
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  }, [premiumActive, setError, userId]);

  return { pendingAction, runWrite };
};
