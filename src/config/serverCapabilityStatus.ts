import { useCallback, useEffect, useState } from 'react';
import { getFeatureExposure, type FeatureKey } from './featureExposure';

export const CAPABILITY_STATUS_ENDPOINT = '/api/capabilities/status';

export type CapabilityAvailabilityReason =
  | 'available'
  | 'registry_disabled'
  | 'deployment_disabled'
  | 'emergency_disabled'
  | 'unknown';

export type CapabilityStatusEntry = {
  available: boolean;
  reason: CapabilityAvailabilityReason;
};

export type ServerCapabilityStatusResponse = {
  capabilities: Record<string, CapabilityStatusEntry>;
};

type CapabilityStatusSnapshot = {
  loaded: boolean;
  capabilities: Record<string, CapabilityStatusEntry>;
};

export type ServerBackedFeatureRuntimeState = 'loading' | 'available' | 'unavailable';

const EMPTY_STATUS: CapabilityStatusSnapshot = {
  loaded: false,
  capabilities: {},
};

const unavailableCapabilityKeys = new Set<string>();
const statusListeners = new Set<() => void>();
let cachedStatusSnapshot: CapabilityStatusSnapshot = EMPTY_STATUS;
let cachedStatusRequest: Promise<CapabilityStatusSnapshot> | null = null;

/** Notifies runtime hooks when a capability becomes unavailable after page load. */
const notifyCapabilityStatusListeners = (): void => {
  statusListeners.forEach((listener) => listener());
};

/** Marks a server capability unavailable after a disabled API response. */
export const markServerCapabilityUnavailable = (capabilityKey: string): void => {
  if (unavailableCapabilityKeys.has(capabilityKey)) {
    return;
  }

  unavailableCapabilityKeys.add(capabilityKey);
  notifyCapabilityStatusListeners();
};

/** Resets local unavailable markers and the shared status cache. Intended for tests. */
export const resetServerCapabilityStatusState = (): void => {
  unavailableCapabilityKeys.clear();
  cachedStatusSnapshot = EMPTY_STATUS;
  cachedStatusRequest = null;
  notifyCapabilityStatusListeners();
};

/** Returns the server capability key for a registry feature when server-backed. */
export const getServerCapabilityKeyForFeature = (feature: FeatureKey): string | null => {
  const definition = getFeatureExposure(feature);
  if (!definition.serverBacked) {
    return null;
  }

  return definition.serverCapabilityKey;
};

/** Returns true when the payload matches the public capability status shape. */
export const isServerCapabilityStatusResponse = (
  payload: unknown
): payload is ServerCapabilityStatusResponse => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  return typeof (payload as ServerCapabilityStatusResponse).capabilities === 'object';
};

/** Reads the public server capability status document. */
export const fetchServerCapabilityStatus = async (): Promise<ServerCapabilityStatusResponse> => {
  const response = await fetch(CAPABILITY_STATUS_ENDPOINT);
  if (!response.ok) {
    throw new Error('Unable to fetch server capability status.');
  }

  const payload = await response.json();
  if (!isServerCapabilityStatusResponse(payload)) {
    throw new Error('Server capability status response was malformed.');
  }

  return payload;
};

/** Loads capability status once per page and reuses the settled result. */
export const loadSharedServerCapabilityStatus = (): Promise<CapabilityStatusSnapshot> => {
  if (cachedStatusSnapshot.loaded) {
    return Promise.resolve(cachedStatusSnapshot);
  }

  if (!cachedStatusRequest) {
    cachedStatusRequest = fetchServerCapabilityStatus()
      .then((response) => {
        cachedStatusSnapshot = {
          loaded: true,
          capabilities: response.capabilities,
        };
        notifyCapabilityStatusListeners();
        return cachedStatusSnapshot;
      })
      .catch(() => {
        cachedStatusSnapshot = {
          loaded: true,
          capabilities: {},
        };
        notifyCapabilityStatusListeners();
        return cachedStatusSnapshot;
      });
  }

  return cachedStatusRequest;
};

/** Returns whether a capability is currently treated as unavailable on the client. */
export const isServerCapabilityAvailable = (
  capabilityKey: string,
  status: CapabilityStatusSnapshot = EMPTY_STATUS
): boolean => {
  if (unavailableCapabilityKeys.has(capabilityKey)) {
    return false;
  }

  if (!status.loaded) {
    return false;
  }

  const entry = status.capabilities[capabilityKey];
  return entry?.available === true;
};

/** Resolves runtime UI state for a server-backed registry feature. */
export const resolveServerBackedFeatureRuntimeState = (
  feature: FeatureKey,
  status: CapabilityStatusSnapshot = EMPTY_STATUS
): ServerBackedFeatureRuntimeState => {
  const definition = getFeatureExposure(feature);
  if (!definition.serverBacked) {
    return 'available';
  }

  const capabilityKey = definition.serverCapabilityKey;
  if (unavailableCapabilityKeys.has(capabilityKey)) {
    return 'unavailable';
  }

  if (!status.loaded) {
    return 'loading';
  }

  return isServerCapabilityAvailable(capabilityKey, status) ? 'available' : 'unavailable';
};

/** Loads server capability status once and keeps local unavailable markers in sync. */
export const useServerCapabilityStatus = (): CapabilityStatusSnapshot => {
  const [status, setStatus] = useState<CapabilityStatusSnapshot>(cachedStatusSnapshot);

  const reload = useCallback(() => {
    setStatus({ ...cachedStatusSnapshot });
  }, []);

  useEffect(() => {
    statusListeners.add(reload);
    let active = true;

    loadSharedServerCapabilityStatus().then(() => {
      if (active) {
        reload();
      }
    });

    return () => {
      active = false;
      statusListeners.delete(reload);
    };
  }, [reload]);

  return status;
};

/** Returns whether a server-backed feature is available at runtime on this deployment. */
export const useServerCapabilityAvailable = (feature: FeatureKey): boolean => {
  const capabilityKey = getServerCapabilityKeyForFeature(feature);
  const status = useServerCapabilityStatus();

  if (!capabilityKey) {
    return true;
  }

  return isServerCapabilityAvailable(capabilityKey, status);
};

/** Returns whether a server-backed feature should allow server API calls. */
export const useServerCapabilityApiEnabled = (feature: FeatureKey): boolean =>
  useServerCapabilityAvailable(feature);

/** Returns runtime UI state for a server-backed registry feature. */
export const useServerBackedFeatureRuntimeState = (
  feature: FeatureKey
): ServerBackedFeatureRuntimeState => {
  const status = useServerCapabilityStatus();
  return resolveServerBackedFeatureRuntimeState(feature, status);
};
