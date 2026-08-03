import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { CUSTOM_PRODUCT_LIMITS, type HostedCustomProduct } from '../types/customProducts';
import type { CustomProductDraft, CustomProductsRepository } from './customProductsRepository';
import { isHostedCustomProduct } from './customProducts';
import {
  assertExpectedVersion,
  createHostedProduct,
  reviseProduct,
  sortProducts,
} from './customProductRepositoryModel';
import { requireDb } from './firebase';

export const CUSTOM_PRODUCT_DOCUMENT_SLOTS = Array.from(
  { length: CUSTOM_PRODUCT_LIMITS.productsPerAccount },
  (_, index) => `product-${String(index + 1).padStart(2, '0')}`,
);

interface FirestoreProductRecord {
  slotId: string;
  product: HostedCustomProduct;
}

const collectionRef = (userId: string) => collection(requireDb(), 'users', userId, 'customProducts');
const productRef = (userId: string, slotId: string) => doc(requireDb(), 'users', userId, 'customProducts', slotId);

const ownedProduct = (value: unknown, userId: string): value is HostedCustomProduct =>
  isHostedCustomProduct(value) && value.userId === userId;

const readRecords = async (userId: string): Promise<FirestoreProductRecord[]> => {
  const snapshot = await getDocs(collectionRef(userId));
  return snapshot.docs.flatMap((item) => {
    const value = item.data();
    return ownedProduct(value, userId) ? [{ slotId: item.id, product: value }] : [];
  });
};

const findRecord = async (userId: string, productId: string): Promise<FirestoreProductRecord> => {
  const record = (await readRecords(userId)).find(({ product }) => product.id === productId);
  if (!record) throw new Error('Custom product not found.');
  return record;
};

const requireCurrentProduct = (value: unknown, userId: string, productId: string): HostedCustomProduct => {
  if (!isHostedCustomProduct(value)) throw new Error('Custom product not found.');
  if (value.userId !== userId) throw new Error('Custom product not found.');
  if (value.id !== productId) throw new Error('Custom product not found.');
  return value;
};

const withStoredProduct = async <T>(
  userId: string,
  expected: HostedCustomProduct,
  operation: (transaction: Transaction, reference: DocumentReference, current: HostedCustomProduct) => T,
): Promise<T> => {
  const { slotId } = await findRecord(userId, expected.id);
  return runTransaction(requireDb(), async (transaction) => {
    const reference = productRef(userId, slotId);
    const current = requireCurrentProduct((await transaction.get(reference)).data(), userId, expected.id);
    assertExpectedVersion(current, expected);
    return operation(transaction, reference, current);
  });
};

const writeRevision = (
  userId: string,
  expected: HostedCustomProduct,
  draft: CustomProductDraft,
  status = expected.status,
): Promise<HostedCustomProduct> => withStoredProduct(userId, expected, (transaction, reference, current) => {
  const revised = reviseProduct(current, draft, status);
  transaction.set(reference, revised);
  return revised;
});

const findOpenSlot = (records: FirestoreProductRecord[]): string => {
  const occupied = new Set(records.map(({ slotId }) => slotId));
  const slot = CUSTOM_PRODUCT_DOCUMENT_SLOTS.find((candidate) => !occupied.has(candidate));
  if (!slot) throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
  return slot;
};

export const firestoreCustomProductsRepository: CustomProductsRepository = {
  async list(userId) {
    return sortProducts((await readRecords(userId)).map(({ product }) => product));
  },
  subscribe(userId, onUpdate, onError) {
    return onSnapshot(collectionRef(userId), (snapshot) => {
      const products = snapshot.docs.map((item) => item.data()).filter((value) => ownedProduct(value, userId));
      onUpdate(sortProducts(products));
    }, (error) => onError?.(error));
  },
  async create(userId, draft) {
    const slot = findOpenSlot(await readRecords(userId));
    const product = createHostedProduct({ id: uuidv4(), userId, draft });
    await runTransaction(requireDb(), async (transaction) => {
      const reference = productRef(userId, slot);
      if ((await transaction.get(reference)).exists()) {
        throw new Error('The selected product slot was claimed. Please try again.');
      }
      transaction.set(reference, product);
    });
    return product;
  },
  update(userId, product, draft) {
    return writeRevision(userId, product, draft);
  },
  setStatus(userId, product, status) {
    return writeRevision(userId, product, product, status);
  },
  async delete(userId, product) {
    await withStoredProduct(userId, product, (transaction, reference) => transaction.delete(reference));
  },
};
