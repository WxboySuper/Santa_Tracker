import { renderHook, act } from '@testing-library/react';
import { EntitlementProvider, useEntitlement } from './EntitlementProvider';
import { useAuth } from '../auth/AuthProvider';
import { onSnapshot } from 'firebase/firestore';
import { readLocalTestAccount } from '../lib/localTestAccount';

// Mock useAuth
jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../lib/localTestAccount', () => ({
  readLocalTestAccount: jest.fn(() => null),
}));

// Mock lib/firebase
jest.mock('../lib/firebase', () => ({
  db: {},
  requireDb: jest.fn(() => ({})),
}));

// Mock firestore doc and onSnapshot
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ id: 'mock-doc' })),
  onSnapshot: jest.fn(),
}));

describe('EntitlementProvider', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: false,
      status: 'signed_out',
      user: null,
    });
    (readLocalTestAccount as jest.Mock).mockReturnValue(null);
    
    // Do not mock window.location here if it causes issues
  });

  test('provides disabled status when hosted auth is disabled', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ billingEnabled: false }),
    });

    const { result } = renderHook(() => useEntitlement(), {
      wrapper: ({ children }) => <EntitlementProvider>{children}</EntitlementProvider>,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.entitlementStatus).toBe('disabled');
  });

  test('subscribes to entitlements when signed in and hosted mode active', async () => {
    const mockUnsubscribe = jest.fn();
    (onSnapshot as jest.Mock).mockReturnValue(mockUnsubscribe);

    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: { uid: 'user-123', getIdToken: jest.fn().mockResolvedValue('token') },
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ billingEnabled: true, checkoutEnabled: true }),
    });

    const { unmount } = renderHook(() => useEntitlement(), {
      wrapper: ({ children }) => <EntitlementProvider>{children}</EntitlementProvider>,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSnapshot).toHaveBeenCalled();
    
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  test('openCheckout calls API', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
      user: { uid: 'user-123', getIdToken: jest.fn().mockResolvedValue('token') },
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ // billing config
        ok: true,
        json: () => Promise.resolve({ billingEnabled: true, checkoutEnabled: true }),
      })
      .mockResolvedValueOnce({ // checkout action
        ok: true,
        json: () => Promise.resolve({ url: 'https://stripe.com/checkout' }),
      });

    const { result } = renderHook(() => useEntitlement(), {
      wrapper: ({ children }) => <EntitlementProvider>{children}</EntitlementProvider>,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // We can't easily test the redirect without crashing JSDOM in some envs,
    // but we can test that the fetch was called.
    // We catch the error that JSDOM throws on navigation.
    try {
      await act(async () => {
        await result.current.openCheckout('monthly');
      });
    } catch {
      // Ignore navigation error
    }

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout', expect.any(Object));
  });

  test('openCheckout throws error if user not signed in', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_out',
      user: null,
    });

    const { result } = renderHook(() => useEntitlement(), {
      wrapper: ({ children }) => <EntitlementProvider>{children}</EntitlementProvider>,
    });

    await act(async () => {
      await expect(result.current.openCheckout('monthly')).rejects.toThrow('Sign in before starting billing actions.');
    });
  });

  const expectCheckoutBlocked = async ({
    hostedAuthEnabled,
    localTestAccount,
    expectedMessage,
  }: {
    hostedAuthEnabled: boolean;
    localTestAccount: 'premium' | null;
    expectedMessage: string;
  }) => {
    (useAuth as jest.Mock).mockReturnValue({
      hostedAuthEnabled,
      status: 'signed_in',
      user: { uid: 'user-123', getIdToken: jest.fn().mockResolvedValue('token') },
    });
    (readLocalTestAccount as jest.Mock).mockReturnValue(localTestAccount);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ billingEnabled: true, checkoutEnabled: true }),
    });

    const { result } = renderHook(() => useEntitlement(), {
      wrapper: ({ children }) => <EntitlementProvider>{children}</EntitlementProvider>,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect(result.current.openCheckout('monthly')).rejects.toThrow(expectedMessage);
    expect(global.fetch).not.toHaveBeenCalledWith('/api/billing/checkout', expect.any(Object));
  };

  test('openCheckout rejects when hosted auth is disabled', async () => {
    await expectCheckoutBlocked({
      hostedAuthEnabled: false,
      localTestAccount: null,
      expectedMessage: 'Billing is not available on this deployment yet.',
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/config');
  });

  test('openCheckout rejects for local test accounts', async () => {
    await expectCheckoutBlocked({
      hostedAuthEnabled: true,
      localTestAccount: 'premium',
      expectedMessage: 'Billing is unavailable for local test accounts.',
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/config');
  });
});
