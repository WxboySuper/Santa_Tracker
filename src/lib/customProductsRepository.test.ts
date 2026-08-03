import type { CustomCategoryId, HostedCustomProduct } from '../types/customProducts';
import {
  CUSTOM_PRODUCT_DOCUMENT_SLOTS,
  createHostedProduct,
  localCustomProductsRepository,
  normalizeCustomProductCategories,
  type CustomProductDraft,
} from './customProductsRepository';
import {
  clearCustomProductForecastHandoff,
  consumeCustomProductForecastHandoff,
  CUSTOM_PRODUCT_HANDOFF_KEY,
  stageCustomProductForForecast,
} from './customProductHandoff';

const category = (id: string, order: number) => ({
  id: id as CustomCategoryId,
  label: id,
  order,
  style: {
    fillColor: '#ff0000',
    fillOpacity: 0.5,
    strokeColor: '#990000',
    strokeOpacity: 1,
    strokeWidth: 2,
    hatch: 'none' as const,
  },
});

const draft = (label = 'Winter hazards'): CustomProductDraft => ({
  label,
  description: 'Reusable desk template',
  categories: [category('Moderate', 0), category('High', 1)],
});

describe('customProductsRepository', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('reserves fixed Firestore document slots separately from logical product ids', () => {
    expect(CUSTOM_PRODUCT_DOCUMENT_SLOTS).toHaveLength(20);
    expect(CUSTOM_PRODUCT_DOCUMENT_SLOTS[0]).toBe('product-01');
    expect(CUSTOM_PRODUCT_DOCUMENT_SLOTS[19]).toBe('product-20');
  });

  test('normalizes category order without retaining mutable style references', () => {
    const source = [category('High', 9), category('Moderate', 4)];
    const normalized = normalizeCustomProductCategories(source);

    expect(normalized.map((item) => item.order)).toEqual([0, 1]);
    expect(normalized[0].style).not.toBe(source[0].style);
  });

  test('supports create, edit, archive, and delete in the safe local repository', async () => {
    const created = await localCustomProductsRepository.create('user-1', draft());
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.version).toBe(1);

    const updated = await localCustomProductsRepository.update('user-1', created, draft('Winter impacts'));
    expect(updated.label).toBe('Winter impacts');
    expect(updated.version).toBe(2);

    const archived = await localCustomProductsRepository.setStatus('user-1', updated, 'archived');
    expect(archived.status).toBe('archived');
    expect(archived.version).toBe(3);

    await localCustomProductsRepository.delete('user-1', archived);
    expect(await localCustomProductsRepository.list('user-1')).toEqual([]);

    const replacement = await localCustomProductsRepository.create('user-1', draft('Replacement'));
    expect(replacement.id).not.toBe(created.id);
  });

  test('rejects stale expected-version writes instead of overwriting a newer session', async () => {
    const created = await localCustomProductsRepository.create('user-1', draft());
    const updated = await localCustomProductsRepository.update('user-1', created, draft('Newest'));

    await expect(localCustomProductsRepository.update('user-1', created, draft('Stale overwrite')))
      .rejects.toThrow('changed in another session');
    await expect(localCustomProductsRepository.setStatus('user-1', created, 'archived'))
      .rejects.toThrow('changed in another session');
    await expect(localCustomProductsRepository.delete('user-1', created))
      .rejects.toThrow('changed in another session');
    expect((await localCustomProductsRepository.list('user-1'))[0]).toEqual(updated);
  });

  test('serializes concurrent local mutations with the deterministic fallback lock', async () => {
    const originalLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    try {
      await Promise.all([
        localCustomProductsRepository.create('user-1', draft('First concurrent product')),
        localCustomProductsRepository.create('user-1', draft('Second concurrent product')),
      ]);
      expect((await localCustomProductsRepository.list('user-1')).map(({ label }) => label).sort()).toEqual([
        'First concurrent product',
        'Second concurrent product',
      ]);

      const current = (await localCustomProductsRepository.list('user-1'))[0];
      const updates = await Promise.allSettled([
        localCustomProductsRepository.update('user-1', current, draft('Winning revision A')),
        localCustomProductsRepository.update('user-1', current, draft('Winning revision B')),
      ]);
      expect(updates.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(updates.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      expect(Math.max(...(await localCustomProductsRepository.list('user-1')).map(({ version }) => version))).toBe(2);
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks });
    }
  });

  test('subscribes to live local updates and releases the listener cleanly', async () => {
    const onUpdate = jest.fn();
    const unsubscribe = localCustomProductsRepository.subscribe('user-1', onUpdate);
    expect(onUpdate).toHaveBeenLastCalledWith([]);

    await localCustomProductsRepository.create('user-1', draft());
    expect(onUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ label: 'Winter hazards' })]);

    unsubscribe();
    await localCustomProductsRepository.create('user-1', draft('Second'));
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  test('keeps account libraries isolated and enforces all twenty slots', async () => {
    for (let index = 0; index < 20; index += 1) {
      await localCustomProductsRepository.create('alice', draft(`Product ${index + 1}`));
    }

    await expect(localCustomProductsRepository.create('alice', draft('Overflow'))).rejects.toThrow('limit reached');
    expect(await localCustomProductsRepository.list('bob')).toEqual([]);
  });

  test('stages an immutable snapshot and blocks inactive entitlement or archived products', () => {
    const product = createHostedProduct({
      id: 'product-01',
      userId: 'user-1',
      draft: draft(),
      now: '2026-07-17T12:00:00.000Z',
    });
    const layer = stageCustomProductForForecast(product, true);
    const stored = JSON.parse(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY) ?? 'null');

    product.categories[0].label = 'Mutated later';
    expect(layer.productSnapshot?.categories[0].label).toBe('Moderate');
    expect(stored.productSnapshot.sourceProductVersion).toBe(1);
    expect(consumeCustomProductForecastHandoff(true)).toEqual(layer);
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();
    expect(() => stageCustomProductForForecast(product, false)).toThrow('Premium');
    expect(() => stageCustomProductForForecast({ ...product, status: 'archived' } as HostedCustomProduct, true)).toThrow('Archived');
  });

  test('clears malformed or invalid forecast handoffs without consuming them', () => {
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, '{bad json');
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();

    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify({ id: 'not-a-layer' }));
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();
  });

  test('rejects a staged product after entitlement expires and clears only matching deleted-product handoffs', () => {
    const product = createHostedProduct({ id: 'product-01', userId: 'user-1', draft: draft(), now: '2026-07-17T12:00:00.000Z' });
    stageCustomProductForForecast(product, true);
    expect(consumeCustomProductForecastHandoff(false)).toBeNull();
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();

    stageCustomProductForForecast(product, true);
    clearCustomProductForecastHandoff('another-product' as HostedCustomProduct['id']);
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).not.toBeNull();
    clearCustomProductForecastHandoff(product.id);
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();
  });
});
