/** True when this build targets the locked beta deployment. */
export const isBetaModeEnabled = (): boolean => __GFC_BETA_MODE__;

/** Optional invite-path segment used by the beta onboarding URL. */
export const getBetaInvitePath = (): string => __GFC_BETA_INVITE_PATH__.trim();

export const LOCAL_BETA_BYPASS_STORAGE_KEY = 'gfc-local-beta-bypass';
const LOCAL_BETA_BYPASS_PARAM = 'localBetaBypass';

/** True when the current hostname is a local/dev host where the beta gate may be bypassed. */
export const isLocalBetaBypassHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '[::1]' ||
    normalized.startsWith('127.') ||
    normalized.endsWith('.local')
  );
};

/** Parses one string flag into true, false, or null when the value is not an explicit boolean-ish toggle. */
const parseLocalBetaBypassFlag = (value: string | null | undefined): boolean | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
};

/** Resolves whether the local beta bypass should be active for the given host/search/storage state. */
export const resolveLocalBetaBypass = ({
  hostname,
  search,
  storageValue,
}: {
  hostname: string;
  search?: string;
  storageValue?: string | null;
}): boolean => {
  if (!isLocalBetaBypassHost(hostname)) {
    return false;
  }

  const params = new URLSearchParams(search ?? '');
  const queryOverride = parseLocalBetaBypassFlag(params.get(LOCAL_BETA_BYPASS_PARAM));
  if (queryOverride !== null) {
    return queryOverride;
  }

  return parseLocalBetaBypassFlag(storageValue) ?? false;
};

/** Returns true when a localhost-only beta bypass should let the current session past the beta gate. */
export const isLocalBetaBypassEnabled = (search = ''): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  let storageValue: string | null = null;

  try {
    storageValue = localStorage.getItem(LOCAL_BETA_BYPASS_STORAGE_KEY);
  } catch {
    storageValue = null;
  }

  const enabled = resolveLocalBetaBypass({
    hostname,
    search,
    storageValue,
  });

  const params = new URLSearchParams(search);
  const queryOverride = parseLocalBetaBypassFlag(params.get(LOCAL_BETA_BYPASS_PARAM));

  if (queryOverride !== null && isLocalBetaBypassHost(hostname)) {
    try {
      if (queryOverride) {
        localStorage.setItem(LOCAL_BETA_BYPASS_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(LOCAL_BETA_BYPASS_STORAGE_KEY);
      }
    } catch {
      // Ignore local storage failures so local routing still works.
    }
  }

  return enabled;
};
