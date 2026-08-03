import { useCallback } from 'react';
import type { HostedCustomProduct, HostedCustomProductStatus } from '../types/customProducts';
import type { CustomProductDraft, CustomProductsRepository } from '../lib/customProductsRepository';
import { clearCustomProductForecastHandoff } from '../lib/customProductHandoff';
import type { RunCustomProductWrite } from './useCustomProductWriter';

const duplicateDraft = (product: HostedCustomProduct): CustomProductDraft => ({
  label: `${product.label} copy`.slice(0, 64),
  description: product.description,
  categories: product.categories,
});

/** Builds the library CRUD commands around the shared serialized write runner. */
export const useCustomProductCrudActions = (
  repository: CustomProductsRepository,
  runWrite: RunCustomProductWrite,
) => {
  const createProduct = useCallback((draft: CustomProductDraft) =>
    runWrite('create', undefined, (uid) => repository.create(uid, draft)), [repository, runWrite]);
  const updateProduct = useCallback((product: HostedCustomProduct, draft: CustomProductDraft) =>
    runWrite('update', product.id, (uid) => repository.update(uid, product, draft)), [repository, runWrite]);
  const duplicateProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('duplicate', product.id, (uid) => repository.create(uid, duplicateDraft(product))), [repository, runWrite]);
  const setProductStatus = useCallback((product: HostedCustomProduct, status: HostedCustomProductStatus) =>
    runWrite('status', product.id, (uid) => repository.setStatus(uid, product, status)), [repository, runWrite]);
  const deleteProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('delete', product.id, async (uid) => {
      await repository.delete(uid, product);
      clearCustomProductForecastHandoff(product.id);
    }, false), [repository, runWrite]);
  return { createProduct, updateProduct, duplicateProduct, setProductStatus, deleteProduct };
};
