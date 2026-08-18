import {
  isLocalBetaBypassEnabled,
  isLocalBetaBypassHost,
  LOCAL_BETA_BYPASS_STORAGE_KEY,
  resolveLocalBetaBypass,
} from './betaAccess';

describe('betaAccess local bypass', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  test('recognizes local development hostnames only', () => {
    expect(isLocalBetaBypassHost('localhost')).toBe(true);
    expect(isLocalBetaBypassHost('127.0.0.1')).toBe(true);
    expect(isLocalBetaBypassHost('devbox.local')).toBe(true);
    expect(isLocalBetaBypassHost('0.0.0.0')).toBe(false);
    expect(isLocalBetaBypassHost('example.com')).toBe(false);
  });

  test('prefers the query-string local bypass flag over storage on localhost', () => {
    expect(
      resolveLocalBetaBypass({
        hostname: 'localhost',
        search: '?localBetaBypass=1',
        storageValue: 'false',
      })
    ).toBe(true);

    expect(
      resolveLocalBetaBypass({
        hostname: 'localhost',
        search: '?localBetaBypass=0',
        storageValue: 'true',
      })
    ).toBe(false);
  });

  test('never enables the local bypass on non-local hosts', () => {
    expect(
      resolveLocalBetaBypass({
        hostname: 'example.com',
        search: '?localBetaBypass=1',
        storageValue: 'true',
      })
    ).toBe(false);
  });

  test('persists a localhost query-string bypass into local storage for future visits', () => {
    window.history.replaceState({}, '', '/forecast?localBetaBypass=1');

    expect(isLocalBetaBypassEnabled(window.location.search)).toBe(true);
    expect(localStorage.getItem(LOCAL_BETA_BYPASS_STORAGE_KEY)).toBe('true');

    window.history.replaceState({}, '', '/forecast');
    expect(isLocalBetaBypassEnabled(window.location.search)).toBe(true);
  });

  test('clears the persisted localhost bypass when explicitly disabled', () => {
    localStorage.setItem(LOCAL_BETA_BYPASS_STORAGE_KEY, 'true');
    window.history.replaceState({}, '', '/forecast?localBetaBypass=0');

    expect(isLocalBetaBypassEnabled(window.location.search)).toBe(false);
    expect(localStorage.getItem(LOCAL_BETA_BYPASS_STORAGE_KEY)).toBeNull();
  });
});
