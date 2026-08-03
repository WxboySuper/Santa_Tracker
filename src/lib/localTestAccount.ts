export type LocalTestAccountTier = 'free' | 'premium';

const LOCAL_TEST_ACCOUNT_STORAGE_KEY = 'gfc-local-test-account';

/** Reads the disposable fixture tier without allowing blocked storage to crash app startup. */
const readStoredTestAccount = (): string | null => {
  try {
    return window.sessionStorage.getItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Persists the disposable fixture tier and reports whether browser storage accepted it. */
const writeStoredTestAccount = (tier: LocalTestAccountTier): boolean => {
  try {
    window.sessionStorage.setItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY, tier);
    return true;
  } catch {
    return false;
  }
};

/** Keeps test-account fixtures out of production/staging builds even when served from a local hostname. */
export const isLocalTestAccountEnabled = (hostname: string, developmentMode: boolean): boolean =>
  developmentMode && ['localhost', '127.0.0.1'].includes(hostname);

/** Returns the disposable local account fixture requested by the browser URL. */
export const readLocalTestAccount = (): LocalTestAccountTier | null => {
  if (typeof window === 'undefined' || !isLocalTestAccountEnabled(window.location.hostname, __GFC_DEV_MODE__)) {
    return null;
  }

  const queryTier = new URLSearchParams(window.location.search).get('localTestAccount');
  if (queryTier === 'free' || queryTier === 'premium') {
    return writeStoredTestAccount(queryTier) ? queryTier : null;
  }

  const storedTier = readStoredTestAccount();
  return storedTier === 'free' || storedTier === 'premium' ? storedTier : null;
};

/** Clears the disposable fixture so a developer can return to normal local or hosted auth. */
export const clearLocalTestAccount = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOCAL_TEST_ACCOUNT_STORAGE_KEY);
  } catch {
    // Storage may be blocked; still remove the URL fixture request below.
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has('localTestAccount')) return;
  url.searchParams.delete('localTestAccount');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

/** Builds the stable identity used by the disposable local account fixture. */
export const createLocalTestUser = (tier: LocalTestAccountTier) => ({
  uid: `local-test-${tier}`,
  email: `${tier}@local.test`,
  displayName: `Local ${tier} test account`,
  photoURL: null,
  providerData: [],
  isAnonymous: false,
});
