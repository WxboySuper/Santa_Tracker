import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db, requireDb } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import { readLocalTestAccount } from '../lib/localTestAccount';

export type EntitlementStatus = 'disabled' | 'loading' | 'free' | 'premium' | 'error';
export type PlanInterval = 'monthly' | 'annual' | null;
type EffectiveSource = 'stripe' | 'beta_override' | 'none';

interface BillingConfig {
  billingEnabled: boolean;
  checkoutEnabled: boolean;
  annualPromoActive: boolean;
  monthlyDisplayPrice: string;
  annualDisplayPrice: string;
}

interface UserEntitlementDocument {
  uid: string;
  premiumActive: boolean;
  effectiveSource: EffectiveSource;
  planInterval: PlanInterval;
  billingStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Timestamp | null;
  betaOverrideActive: boolean;
  updatedAt?: Timestamp | null;
}

interface EntitlementContextValue {
  entitlementStatus: EntitlementStatus;
  premiumActive: boolean;
  planInterval: PlanInterval;
  billingStatus: string;
  effectiveSource: EffectiveSource;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  betaOverrideActive: boolean;
  checkoutEnabled: boolean;
  billingEnabled: boolean;
  annualPromoActive: boolean;
  monthlyDisplayPrice: string;
  annualDisplayPrice: string;
  error: string | null;
  openCheckout: (plan: 'monthly' | 'annual') => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const DEFAULT_BILLING_CONFIG: BillingConfig = {
  billingEnabled: false,
  checkoutEnabled: false,
  annualPromoActive: false,
  monthlyDisplayPrice: '$3/month',
  annualDisplayPrice: '$30/year',
};

const DEFAULT_ENTITLEMENT: UserEntitlementDocument = {
  uid: '',
  premiumActive: false,
  effectiveSource: 'none',
  planInterval: null,
  billingStatus: 'inactive',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  betaOverrideActive: false,
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);
const VALID_EFFECTIVE_SOURCES: EffectiveSource[] = ['stripe', 'beta_override', 'none'];

interface EntitlementListenerState {
  entitlement: UserEntitlementDocument;
  status: EntitlementStatus;
  error: string | null;
}

/** Returns the auth header needed for server-side billing endpoints. */
const createAuthHeaders = async (getToken: () => Promise<string>): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await getToken()}`,
  'Content-Type': 'application/json',
});

/** Reads the billing service config and falls back safely when the hosted service is unavailable. */
const fetchBillingConfig = async (): Promise<BillingConfig> => {
  try {
    const response = await fetch('/api/billing/config');
    if (!response.ok) {
      return DEFAULT_BILLING_CONFIG;
    }

    const data = await response.json();
    return {
      billingEnabled: Boolean(data.billingEnabled),
      checkoutEnabled: Boolean(data.checkoutEnabled),
      annualPromoActive: Boolean(data.annualPromoActive),
      monthlyDisplayPrice: typeof data.monthlyDisplayPrice === 'string' ? data.monthlyDisplayPrice : DEFAULT_BILLING_CONFIG.monthlyDisplayPrice,
      annualDisplayPrice: typeof data.annualDisplayPrice === 'string' ? data.annualDisplayPrice : DEFAULT_BILLING_CONFIG.annualDisplayPrice,
    };
  } catch {
    return DEFAULT_BILLING_CONFIG;
  }
};

/** Loads the billing config once on mount and keeps the provider code flatter. */
const useBillingConfigState = (): BillingConfig => {
  const [billingConfig, setBillingConfig] = useState<BillingConfig>(DEFAULT_BILLING_CONFIG);

  useEffect(() => {
    fetchBillingConfig().then(setBillingConfig);
  }, []);

  return billingConfig;
};

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizeEffectiveSource = (value: unknown): EffectiveSource =>
  VALID_EFFECTIVE_SOURCES.includes(value as EffectiveSource) ? (value as EffectiveSource) : 'none';

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizePlanInterval = (value: unknown): PlanInterval => {
  if (value === 'monthly' || value === 'annual') {
    return value;
  }

  return null;
};

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizeNullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Validates a Firestore entitlement doc before the UI trusts it. */
const readEntitlementDocument = (value: Partial<UserEntitlementDocument> | undefined): UserEntitlementDocument => {
  if (!value) {
    return DEFAULT_ENTITLEMENT;
  }

  return {
    uid: normalizeNullableString(value.uid) ?? '',
    premiumActive: Boolean(value.premiumActive),
    effectiveSource: normalizeEffectiveSource(value.effectiveSource),
    planInterval: normalizePlanInterval(value.planInterval),
    billingStatus: normalizeNullableString(value.billingStatus) ?? 'inactive',
    stripeCustomerId: normalizeNullableString(value.stripeCustomerId),
    stripeSubscriptionId: normalizeNullableString(value.stripeSubscriptionId),
    cancelAtPeriodEnd: Boolean(value.cancelAtPeriodEnd),
    currentPeriodEnd: value.currentPeriodEnd ?? null,
    betaOverrideActive: Boolean(value.betaOverrideActive),
    updatedAt: value.updatedAt ?? null,
  };
};

/** Redirects the browser to a server-issued Stripe flow URL. */
const redirectToBillingUrl = (url: string) => {
  window.location.assign(url);
};

/** Applies the disabled hosted-auth fallback into entitlement state. */
const applyDisabledEntitlementState = (
  setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>,
  setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setEntitlement(DEFAULT_ENTITLEMENT);
  setEntitlementStatus('disabled');
  setError(null);
};

/** Applies the signed-out hosted-auth fallback into entitlement state. */
const applySignedOutEntitlementState = (
  setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>,
  setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setEntitlement(DEFAULT_ENTITLEMENT);
  setEntitlementStatus('free');
  setError(null);
};

/** Converts a successful entitlement snapshot into provider state. */
const createEntitlementListenerState = (snapshotData: Partial<UserEntitlementDocument> | undefined): EntitlementListenerState => {
  const entitlement = readEntitlementDocument(snapshotData);
  return {
    entitlement,
    status: entitlement.premiumActive ? 'premium' : 'free',
    error: null,
  };
};

/** Starts the Firestore listener that mirrors hosted entitlement state into the client. */
const subscribeToEntitlements = (
  userId: string,
  handlers: {
    setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>;
    setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  const entitlementRef = doc(requireDb(), 'userEntitlements', userId);

  return onSnapshot(
    entitlementRef,
    (snapshot) => {
      const nextState = createEntitlementListenerState(
        snapshot.data() as Partial<UserEntitlementDocument> | undefined
      );
      handlers.setEntitlement(nextState.entitlement);
      handlers.setEntitlementStatus(nextState.status);
      handlers.setError(nextState.error);
    },
    (nextError) => {
      handlers.setEntitlement(DEFAULT_ENTITLEMENT);
      handlers.setEntitlementStatus('error');
      handlers.setError(nextError.message);
    }
  );
};

/** True when the provider should operate in hosted mode for the current render. */
const isHostedEntitlementMode = (hostedAuthEnabled: boolean): boolean => Boolean(hostedAuthEnabled && db);

/** Applies the loading state used while auth is still resolving. */
const applyLoadingEntitlementState = (
  setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>
) => {
  setEntitlementStatus('loading');
};

/** Returns true when auth is currently signed out from the hosted entitlement perspective. */
const isSignedOutEntitlementState = (status: ReturnType<typeof useAuth>['status'], user: ReturnType<typeof useAuth>['user']) =>
  status !== 'signed_in' || !user;

/** Starts the signed-in entitlement subscription and returns its cleanup callback. */
const startSignedInEntitlementSubscription = (
  userId: string,
  handlers: {
    setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>;
    setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  handlers.setEntitlementStatus('loading');
  return subscribeToEntitlements(userId, handlers);
};

/** Applies deterministic entitlement state for a local account fixture. */
const applyLocalTestEntitlementState = (
  tier: 'free' | 'premium',
  handlers: {
    setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>;
    setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  },
): void => {
  const premium = tier === 'premium';
  handlers.setEntitlement({
    ...DEFAULT_ENTITLEMENT,
    uid: `local-test-${tier}`,
    premiumActive: premium,
    effectiveSource: premium ? 'stripe' : 'none',
    planInterval: premium ? 'monthly' : null,
    billingStatus: premium ? 'active' : 'inactive',
  });
  handlers.setEntitlementStatus(premium ? 'premium' : 'free');
  handlers.setError(null);
};

/** Resolves the next entitlement effect outcome for the current auth snapshot. */
const resolveEntitlementEffect = (
  args: {
    hostedAuthEnabled: boolean;
    status: ReturnType<typeof useAuth>['status'];
    user: ReturnType<typeof useAuth>['user'];
  },
  handlers: {
    setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>;
    setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  const localTestAccount = readLocalTestAccount();
  if (localTestAccount) {
    applyLocalTestEntitlementState(localTestAccount, handlers);
    return null;
  }

  if (!isHostedEntitlementMode(args.hostedAuthEnabled)) {
    applyDisabledEntitlementState(handlers.setEntitlement, handlers.setEntitlementStatus, handlers.setError);
    return null;
  }

  if (args.status === 'loading') {
    applyLoadingEntitlementState(handlers.setEntitlementStatus);
    return null;
  }

  if (isSignedOutEntitlementState(args.status, args.user)) {
    applySignedOutEntitlementState(handlers.setEntitlement, handlers.setEntitlementStatus, handlers.setError);
    return null;
  }

  if (!args.user) {
    return null;
  }

  return startSignedInEntitlementSubscription(args.user.uid, handlers);
};

/** Converts provider state into the memoized entitlement context value. */
const createEntitlementContextValue = (args: {
  billingConfig: BillingConfig;
  entitlement: UserEntitlementDocument;
  entitlementStatus: EntitlementStatus;
  error: string | null;
  hostedAuthEnabled: boolean;
  openBillingPortal: () => Promise<void>;
  openCheckout: (plan: 'monthly' | 'annual') => Promise<void>;
}): EntitlementContextValue => ({
  entitlementStatus: args.entitlementStatus,
  premiumActive: args.entitlement.premiumActive,
  planInterval: args.entitlement.planInterval,
  billingStatus: args.entitlement.billingStatus,
  effectiveSource: args.entitlement.effectiveSource,
  cancelAtPeriodEnd: args.entitlement.cancelAtPeriodEnd,
  currentPeriodEnd: args.entitlement.currentPeriodEnd?.toDate?.() ?? null,
  stripeCustomerId: args.entitlement.stripeCustomerId,
  betaOverrideActive: args.entitlement.betaOverrideActive,
  checkoutEnabled: args.billingConfig.checkoutEnabled && args.hostedAuthEnabled && !readLocalTestAccount(),
  billingEnabled: args.billingConfig.billingEnabled,
  annualPromoActive: args.billingConfig.annualPromoActive,
  monthlyDisplayPrice: args.billingConfig.monthlyDisplayPrice,
  annualDisplayPrice: args.billingConfig.annualDisplayPrice,
  error: args.error,
  openCheckout: args.openCheckout,
  openBillingPortal: args.openBillingPortal,
});

/** Shared fetch helper for authenticated billing POST endpoints. */
const fetchBillingAction = async (
  currentUser: NonNullable<ReturnType<typeof useAuth>['user']>,
  endpoint: string,
  body?: Record<string, unknown>
) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: await createAuthHeaders(() => currentUser.getIdToken()),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return {
    response,
    data: await response.json().catch(() => ({})),
  };
};

/** Creates the billing action callbacks used by the entitlement provider. */
const useBillingActions = (
  user: ReturnType<typeof useAuth>['user'],
  checkoutEnabled: boolean,
  localFixtureActive: boolean,
) => {
  /** Returns the current signed-in user or throws a user-facing error for billing actions. */
  const requireBillingUser = useCallback(() => {
    if (localFixtureActive) {
      throw new Error('Billing is unavailable for local test accounts.');
    }
    if (!user) {
      throw new Error('Sign in before starting billing actions.');
    }

    return user;
  }, [localFixtureActive, user]);

  /** Returns billing availability or throws a user-facing error for checkout attempts. */
  const requireCheckoutEnabled = useCallback(() => {
    if (!checkoutEnabled) {
      throw new Error('Billing is not available on this deployment yet.');
    }
  }, [checkoutEnabled]);

  /** Starts a Stripe checkout flow for the selected billing interval. */
  const openCheckout = useCallback(async (plan: 'monthly' | 'annual'): Promise<void> => {
    const currentUser = requireBillingUser();
    requireCheckoutEnabled();

    const { response, data } = await fetchBillingAction(currentUser, '/api/billing/checkout', { plan });
    if (!response.ok || typeof data.url !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unable to start checkout right now.');
    }

    redirectToBillingUrl(data.url);
  }, [requireBillingUser, requireCheckoutEnabled]);

  /** Opens the Stripe billing portal for an existing customer. */
  const openBillingPortal = useCallback(async (): Promise<void> => {
    const currentUser = requireBillingUser();

    const { response, data } = await fetchBillingAction(currentUser, '/api/billing/portal');
    if (!response.ok || typeof data.url !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unable to open billing management right now.');
    }

    redirectToBillingUrl(data.url);
  }, [requireBillingUser]);

  return { openCheckout, openBillingPortal };
};

/** Provides one app-readable entitlement source of truth on top of auth. */
export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hostedAuthEnabled, status, user } = useAuth();
  const billingConfig = useBillingConfigState();
  const [entitlement, setEntitlement] = useState<UserEntitlementDocument>(DEFAULT_ENTITLEMENT);
  const [entitlementStatus, setEntitlementStatus] = useState<EntitlementStatus>(hostedAuthEnabled ? 'loading' : 'disabled');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = resolveEntitlementEffect(
      { hostedAuthEnabled, status, user },
      {
        setEntitlement,
        setEntitlementStatus,
        setError,
      }
    );

    if (!unsubscribe) {
      return;
    }

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupEntitlementSubscription() {
      unsubscribe();
    };
  }, [hostedAuthEnabled, status, user]);
  const { openCheckout, openBillingPortal } = useBillingActions(
    user,
    billingConfig.checkoutEnabled,
    Boolean(readLocalTestAccount()),
  );

  const value = useMemo<EntitlementContextValue>(
    () =>
      createEntitlementContextValue({
        billingConfig,
        entitlement,
        entitlementStatus,
        error,
        hostedAuthEnabled,
        openBillingPortal,
        openCheckout,
      }),
    [billingConfig, entitlement, entitlementStatus, error, hostedAuthEnabled, openBillingPortal, openCheckout]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
};

/** Reads the current billing and entitlement state for the hosted product surfaces. */
export const useEntitlement = (): EntitlementContextValue => {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within EntitlementProvider');
  }
  return context;
};
