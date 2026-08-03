import { getBuildTarget } from '../config/buildTarget';
import type {
  CustomCategoryTemplate,
  HostedCustomProduct,
  HostedCustomProductStatus,
} from '../types/customProducts';
import { firestoreCustomProductsRepository, CUSTOM_PRODUCT_DOCUMENT_SLOTS } from './firestoreCustomProductsRepository';
import { localCustomProductsRepository } from './localCustomProductsRepository';

export { CUSTOM_PRODUCT_DOCUMENT_SLOTS };
export {
  createHostedProduct,
  normalizeCustomProductCategories,
} from './customProductRepositoryModel';
export { localCustomProductsRepository } from './localCustomProductsRepository';
export { firestoreCustomProductsRepository } from './firestoreCustomProductsRepository';

export interface CustomProductDraft {
  label: string;
  description?: string;
  categories: CustomCategoryTemplate[];
}

export interface CustomProductsRepository {
  list(userId: string): Promise<HostedCustomProduct[]>;
  subscribe(
    userId: string,
    onUpdate: (products: HostedCustomProduct[]) => void,
    onError?: (error: Error) => void,
  ): () => void;
  create(userId: string, draft: CustomProductDraft): Promise<HostedCustomProduct>;
  update(userId: string, product: HostedCustomProduct, draft: CustomProductDraft): Promise<HostedCustomProduct>;
  setStatus(userId: string, product: HostedCustomProduct, status: HostedCustomProductStatus): Promise<HostedCustomProduct>;
  delete(userId: string, product: HostedCustomProduct): Promise<void>;
}

/** Selects local preview persistence without initializing hosted data on local builds. */
export const getCustomProductsRepository = (): CustomProductsRepository =>
  getBuildTarget() === 'local' ? localCustomProductsRepository : firestoreCustomProductsRepository;
