import { v4 as uuidv4 } from 'uuid';
import { CUSTOM_PRODUCT_LIMITS, type HostedCustomProduct } from '../types/customProducts';
import type { CustomProductsRepository } from './customProductsRepository';
import { isHostedCustomProduct } from './customProducts';
import {
  assertExpectedVersion,
  createHostedProduct,
  reviseProduct,
  sortProducts,
} from './customProductRepositoryModel';

const LOCAL_LIBRARY_PREFIX = 'gfc-local-custom-products';
const localSubscribers = new Map<string, Set<(products: HostedCustomProduct[]) => void>>();
const localMutationQueues = new Map<string, Promise<void>>();
const localKey = (userId: string) => `${LOCAL_LIBRARY_PREFIX}:${userId}`;

const readProducts = (userId: string): HostedCustomProduct[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(userId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortProducts(parsed.filter(isHostedCustomProduct).filter((product) => product.userId === userId));
  } catch {
    return [];
  }
};

const writeProducts = (userId: string, products: HostedCustomProduct[]): void => {
  localStorage.setItem(localKey(userId), JSON.stringify(sortProducts(products)));
};

const withFallbackLock = async <T>(lockName: string, operation: () => T | Promise<T>): Promise<T> => {
  const previous = localMutationQueues.get(lockName) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => current);
  localMutationQueues.set(lockName, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (localMutationQueues.get(lockName) === tail) localMutationQueues.delete(lockName);
  }
};

const withMutationLock = <T>(userId: string, operation: () => T | Promise<T>): Promise<T> => {
  const lockName = `${LOCAL_LIBRARY_PREFIX}:${userId}:mutation`;
  return globalThis.navigator?.locks
    ? globalThis.navigator.locks.request(lockName, operation)
    : withFallbackLock(lockName, operation);
};

interface MutationResult<T> {
  products?: HostedCustomProduct[];
  value: T;
}

const mutateProducts = <T>(
  userId: string,
  mutation: (products: HostedCustomProduct[]) => MutationResult<T>,
): Promise<T> => withMutationLock(userId, () => {
  const result = mutation(readProducts(userId));
  if (result.products) {
    writeProducts(userId, result.products);
    emitProducts(userId);
  }
  return result.value;
});

const expectedProduct = (
  products: HostedCustomProduct[],
  expected: HostedCustomProduct,
): HostedCustomProduct => {
  const current = products.find(({ id }) => id === expected.id);
  if (!current) throw new Error('Custom product not found.');
  assertExpectedVersion(current, expected);
  return current;
};

const replaceProduct = (
  products: HostedCustomProduct[],
  replacement: HostedCustomProduct,
): HostedCustomProduct[] => products.map((product) => product.id === replacement.id ? replacement : product);

const emitProducts = (userId: string): void => {
  const products = readProducts(userId);
  localSubscribers.get(userId)?.forEach((subscriber) => subscriber(products));
};

const subscribeToLocalProducts: CustomProductsRepository['subscribe'] = (userId, onUpdate) => {
  const subscribers = localSubscribers.get(userId) ?? new Set();
  subscribers.add(onUpdate);
  localSubscribers.set(userId, subscribers);
  onUpdate(readProducts(userId));
  const handleStorage = (event: StorageEvent) => {
    if (event.key === localKey(userId)) onUpdate(readProducts(userId));
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener('storage', handleStorage);
    subscribers.delete(onUpdate);
    if (subscribers.size === 0) localSubscribers.delete(userId);
  };
};

export const localCustomProductsRepository: CustomProductsRepository = {
  async list(userId) {
    return readProducts(userId);
  },
  subscribe: subscribeToLocalProducts,
  async create(userId, draft) {
    return mutateProducts(userId, (products) => {
      if (products.length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount) {
        throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
      }
      const product = createHostedProduct({ id: uuidv4(), userId, draft });
      return { products: [...products, product], value: product };
    });
  },
  async update(userId, product, draft) {
    return mutateProducts(userId, (products) => {
      const revised = reviseProduct(expectedProduct(products, product), draft);
      return { products: replaceProduct(products, revised), value: revised };
    });
  },
  async setStatus(userId, product, status) {
    return mutateProducts(userId, (products) => {
      const current = expectedProduct(products, product);
      const revised = reviseProduct(current, current, status);
      return { products: replaceProduct(products, revised), value: revised };
    });
  },
  async delete(userId, product) {
    return mutateProducts(userId, (products) => {
      const current = products.find(({ id }) => id === product.id);
      if (!current) return { value: undefined };
      assertExpectedVersion(current, product);
      return { products: products.filter(({ id }) => id !== product.id), value: undefined };
    });
  },
};
