import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { getCustomProductsRepository } from '../lib/customProductsRepository';
import { useCustomProducts } from './useCustomProducts';

jest.mock('../auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../billing/EntitlementProvider', () => ({ useEntitlement: jest.fn() }));
jest.mock('../lib/customProductsRepository', () => ({ getCustomProductsRepository: jest.fn() }));
const mockClearHandoff = jest.fn();
jest.mock('../lib/customProductHandoff', () => ({
  stageCustomProductForForecast: jest.fn(),
  clearCustomProductForecastHandoff: (...args: unknown[]) => mockClearHandoff(...args),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseEntitlement = useEntitlement as jest.MockedFunction<typeof useEntitlement>;
const mockGetRepository = getCustomProductsRepository as jest.MockedFunction<typeof getCustomProductsRepository>;

const makeRepository = () => ({
  list: jest.fn(),
  subscribe: jest.fn((_userId, onUpdate) => {
    onUpdate([]);
    return jest.fn();
  }),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  setStatus: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue(undefined),
});

const draft = {
  label: 'Fire weather',
  categories: [{
    id: 'elevated',
    label: 'Elevated',
    order: 0,
    style: {
      fillColor: '#ff0000',
      fillOpacity: 0.5,
      strokeColor: '#990000',
      strokeOpacity: 1,
      strokeWidth: 2,
      hatch: 'none' as const,
    },
  }],
};
const product = {
  schemaVersion: '1.0.0', id: 'product-1', userId: 'user-1', label: 'Fire weather',
  version: 1, status: 'active', categories: draft.categories,
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
} as Parameters<ReturnType<typeof useCustomProducts>['deleteProduct']>[0];

describe('useCustomProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as ReturnType<typeof useAuth>);
    mockUseEntitlement.mockReturnValue({ premiumActive: true } as ReturnType<typeof useEntitlement>);
  });

  test('uses the live subscription and cleans it up on unmount', async () => {
    const repository = makeRepository();
    const cleanup = jest.fn();
    repository.subscribe.mockImplementation((_userId, onUpdate) => {
      onUpdate([]);
      return cleanup;
    });
    mockGetRepository.mockReturnValue(repository);

    const { result, unmount } = renderHook(() => useCustomProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(repository.subscribe).toHaveBeenCalledWith('user-1', expect.any(Function), expect.any(Function));

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('blocks a second write while the first action is still pending', async () => {
    const repository = makeRepository();
    let resolveCreate: (() => void) | undefined;
    repository.create.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = () => resolve({});
    }));
    mockGetRepository.mockReturnValue(repository);
    const { result } = renderHook(() => useCustomProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.createProduct(draft as Parameters<typeof result.current.createProduct>[0]);
      second = result.current.createProduct(draft as Parameters<typeof result.current.createProduct>[0]);
    });
    await expect(second).resolves.toBe(false);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(result.current.pendingAction).toEqual({ action: 'create' });

    await act(async () => {
      resolveCreate?.();
      await first;
    });
    expect(result.current.pendingAction).toBeNull();
  });

  test('allows an expired signed-in owner to delete but blocks premium mutations', async () => {
    const repository = makeRepository();
    mockGetRepository.mockReturnValue(repository);
    mockUseEntitlement.mockReturnValue({ premiumActive: false } as ReturnType<typeof useEntitlement>);
    const { result } = renderHook(() => useCustomProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateProduct(product, draft)).resolves.toBe(false);
      await expect(result.current.deleteProduct(product)).resolves.toBe(true);
    });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).toHaveBeenCalledWith('user-1', product);
    expect(mockClearHandoff).toHaveBeenCalledWith(product.id);
  });
});
